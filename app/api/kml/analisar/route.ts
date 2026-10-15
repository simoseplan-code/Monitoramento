import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarKml, linhasDoResultado } from "@/lib/kml/analisar";
import { aplicarSobreposicoes, compararComBase, wktParaLinhasLonLat, type TracadoBase } from "@/lib/kml/base";
import { guardarKml, lerKmlGuardado, registrarFalha } from "@/lib/kml/guardar";
import { baixarKmlDaAcao, SemKmlError } from "@/lib/simo/kml";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMITE_BYTES = 4 * 1024 * 1024; // a Vercel aceita até ~4,5 MB por envio
const TOLERANCIA_M = 15; // padrão único: o mesmo das Sobreposições

// Analisa o KML de uma ação: contagem de pontos e trechos, extensão, municípios, bairros e
// conferências com o nome da ação e com os traçados de outras ações.
//  - Com arquivo enviado: analisa o arquivo (não guarda nada).
//  - Sem arquivo: usa o KML GUARDADO da ação; se ainda não houver (ou se pedir "forcar"),
//    baixa do SIMO, GUARDA e analisa. Assim a próxima análise já parte do arquivo guardado.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const enviado = form?.get("arquivo");
  const idBruto = form?.get("idAcao");
  const idAcao = typeof idBruto === "string" ? idBruto.trim() : "";
  const forcar = form?.get("forcar") === "1";
  const arquivo = enviado instanceof File && enviado.size > 0 ? enviado : null;

  if (!arquivo && !/^\d{1,12}$/.test(idAcao)) {
    return NextResponse.json({ error: "Informe a ação ou escolha um arquivo KML/KMZ." }, { status: 400 });
  }
  if (arquivo && arquivo.size > LIMITE_BYTES) {
    return NextResponse.json({ error: `Arquivo grande demais (${(arquivo.size / 1048576).toFixed(1)} MB). O limite é 4 MB.` }, { status: 413 });
  }
  if (arquivo && !/\.(kml|kmz)$/i.test(arquivo.name)) {
    return NextResponse.json({ error: "O arquivo precisa ser .kml ou .kmz." }, { status: 400 });
  }

  // O nome da ação vem da base (não do navegador), para a conferência de município e extensão.
  let nomeAcao: string | null = null;
  if (/^\d{1,12}$/.test(idAcao)) {
    const { data } = await supabase.from("obras").select("nome_acao").eq("id_acao", idAcao).maybeSingle();
    nomeAcao = data?.nome_acao ?? null;
  }

  const admin = createAdminClient();
  let origem: "envio" | "guardado" | "simo" | "simo_sem_guardar" = "envio";
  let guardadoEm: string | null = null;
  let estagio: "baixando" | "analisando" = "analisando";

  try {
    let buffer: Buffer;
    let nome: string;
    if (arquivo) {
      buffer = Buffer.from(await arquivo.arrayBuffer());
      nome = arquivo.name.slice(0, 200);
    } else {
      const guardado = forcar ? null : await lerKmlGuardado(admin, idAcao);
      if (guardado) {
        ({ buffer, nome } = guardado);
        origem = "guardado";
        guardadoEm = guardado.baixadoEm;
      } else {
        // Cada download entra no SIMO com o login do painel: limita para ninguém sobrecarregar.
        const { data: liberado } = await admin.rpc("check_rate_limit", { p_chave: `kml:${user.id}`, p_limite: 30, p_janela_minutos: 10 });
        if (!liberado) return NextResponse.json({ error: "Muitas análises seguidas. Aguarde alguns minutos." }, { status: 429 });
        estagio = "baixando";
        ({ buffer, nome } = await baixarKmlDaAcao(idAcao));
        estagio = "analisando";
        origem = "simo";
        // Se guardar falhar (ex.: tabela ainda não criada), a análise segue com o arquivo baixado.
        try {
          if (await guardarKml(admin, idAcao, buffer, nome, user.id)) guardadoEm = new Date().toISOString();
          else origem = "simo_sem_guardar";
        } catch (e) {
          console.error("guardar kml:", e instanceof Error ? e.message : e);
          origem = "simo_sem_guardar";
        }
      }
    }

    const resultado = await analisarKml(buffer, nome, nomeAcao);

    // Compara com os traçados de outras ações. Falha aqui não derruba a análise.
    try {
      await compararComABase(supabase, admin, resultado, idAcao);
    } catch (e) {
      console.error("kml base:", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ ok: true, resultado, origem, guardadoEm });
  } catch (e) {
    if (e instanceof SemKmlError) {
      await registrarFalha(admin, idAcao, "sem_kml", e.message).catch(() => undefined);
      // Pediu para baixar de novo e o SIMO não tem mais: o arquivo que já estava guardado é mantido.
      if (forcar) return NextResponse.json({ error: "O SIMO não tem mais KML anexado a essa ação. O arquivo guardado antes foi mantido; abra a análise de novo para usar ele." }, { status: 404 });
      return NextResponse.json({ error: e.message, semKml: true }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "";
    if (estagio === "baixando") await registrarFalha(admin, idAcao, "erro", msg).catch(() => undefined);
    // Mensagens de leitura (KML inválido, KMZ sem .kml) são claras para o usuário.
    const amigavel = /KML|KMZ|zip|SIMO/i.test(msg) ? msg : "Não consegui ler esse arquivo. Confira se é um KML ou KMZ válido.";
    console.error("analisar kml:", e);
    return NextResponse.json({ error: amigavel }, { status: 422 });
  }
}

// A comparação é feita na hora, só leitura. Base de traçados das outras ações:
//  1) obras_tracado: o que vem da ATUALIZAÇÃO do mapa. Sempre vale quando o ID existe aqui;
//  2) KMLs guardados: só entram para o ID que a atualização NÃO tem.
async function compararComABase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  resultado: Awaited<ReturnType<typeof analisarKml>>,
  idAcao: string
): Promise<void> {
  const linhas = linhasDoResultado(resultado);
  const c = resultado.caixa;
  if (linhas.length === 0 || !c) return;
  const folga = 0.002;
  const cruzaCaixa = `min_lon.lte.${c.leste + folga},max_lon.gte.${c.oeste - folga},min_lat.lte.${c.norte + folga},max_lat.gte.${c.sul - folga}`;

  // Só os traçados que cruzam a caixa deste KML (os sem caixa, antigos, entram sempre).
  const { data: tracados } = await admin.from("obras_tracado").select("id_acao, wkt").or(`min_lon.is.null,and(${cruzaCaixa})`);
  const { data: idsDaAtualizacao } = await admin.from("obras_tracado").select("id_acao");
  const daAtualizacao = new Set((idsDaAtualizacao ?? []).map((r) => r.id_acao as string));

  const base: TracadoBase[] = (tracados ?? [])
    .filter((tr) => tr.id_acao !== idAcao)
    .map((tr) => ({ idAcao: tr.id_acao, fonte: "sobreposicoes" as const, linhas: wktParaLinhasLonLat(tr.wkt) }));

  const { data: kmls } = await admin.from("kml_arquivos").select("id_acao, wkt").eq("situacao", "baixado").not("wkt", "is", null).filter("min_lon", "lte", c.leste + folga).filter("max_lon", "gte", c.oeste - folga).filter("min_lat", "lte", c.norte + folga).filter("max_lat", "gte", c.sul - folga);
  for (const k of kmls ?? []) {
    if (k.id_acao === idAcao || daAtualizacao.has(k.id_acao) || !k.wkt) continue;
    base.push({ idAcao: k.id_acao, fonte: "kml", linhas: wktParaLinhasLonLat(k.wkt) });
  }

  const comparacao = compararComBase(linhas, base, TOLERANCIA_M);

  // Nome, órgão e status das ações que se sobrepõem (da base sincronizada).
  const ids = comparacao.itens.slice(0, 50).map((i) => i.idAcao);
  if (ids.length > 0) {
    const { data: obras } = await supabase.from("obras").select("id_acao, nome_acao, orgao, status").in("id_acao", ids);
    const porId = new Map((obras ?? []).map((o) => [o.id_acao, o]));
    for (const i of comparacao.itens) {
      const o = porId.get(i.idAcao);
      i.nome = o?.nome_acao ?? null;
      i.orgao = o?.orgao ?? null;
      i.status = o?.status ?? null;
    }
  }
  aplicarSobreposicoes(resultado, comparacao, TOLERANCIA_M);
}

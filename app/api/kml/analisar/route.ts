import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarKml, linhasDoResultado } from "@/lib/kml/analisar";
import { aplicarSobreposicoes, compararComBase, wktParaLinhasLonLat, type TracadoBase } from "@/lib/kml/base";
import { baixarKmlDaAcao, SemKmlError } from "@/lib/simo/kml";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMITE_BYTES = 4 * 1024 * 1024; // a Vercel aceita até ~4,5 MB por envio

// Analisa o KML de uma ação: contagem de pontos e trechos, extensão, municípios, bairros e
// conferências com o nome da ação. Sem arquivo, baixa o KML anexado à ação direto do SIMO
// (pelo ID); com arquivo, analisa o que foi enviado.
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

  // Cada download entra no SIMO com o login do painel: limita para ninguém sobrecarregar.
  if (!arquivo) {
    const { data: liberado } = await createAdminClient().rpc("check_rate_limit", { p_chave: `kml:${user.id}`, p_limite: 30, p_janela_minutos: 10 });
    if (!liberado) return NextResponse.json({ error: "Muitas análises seguidas. Aguarde alguns minutos." }, { status: 429 });
  }

  // O nome da ação vem da base (não do navegador), para a conferência de município e extensão.
  let nomeAcao: string | null = null;
  if (/^\d{1,12}$/.test(idAcao)) {
    const { data } = await supabase.from("obras").select("nome_acao").eq("id_acao", idAcao).maybeSingle();
    nomeAcao = data?.nome_acao ?? null;
  }

  try {
    const origem = arquivo
      ? { buffer: Buffer.from(await arquivo.arrayBuffer()), nome: arquivo.name.slice(0, 200) }
      : await baixarKmlDaAcao(idAcao);
    const resultado = await analisarKml(origem.buffer, origem.nome, nomeAcao);

    // Compara (pontualmente, sem gravar nada) com a base de traçados das outras ações.
    try {
      await compararComABase(supabase, resultado, idAcao);
    } catch (e) {
      console.error("kml base:", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ ok: true, resultado, origem: arquivo ? "envio" : "simo" });
  } catch (e) {
    if (e instanceof SemKmlError) return NextResponse.json({ error: e.message, semKml: true }, { status: 404 });
    // Mensagens de leitura (KML inválido, KMZ sem .kml) são claras para o usuário.
    const msg = e instanceof Error ? e.message : "";
    const amigavel = /KML|KMZ|zip|SIMO/i.test(msg) ? msg : "Não consegui ler esse arquivo. Confira se é um KML ou KMZ válido.";
    console.error("analisar kml:", e);
    return NextResponse.json({ error: amigavel }, { status: 422 });
  }
}

const TOLERANCIA_M = 10;

// A comparação é feita na hora, só leitura: nada do KML analisado é guardado. A base de
// traçados (hoje vinda do CSV de Sobreposições) é a mesma para toda a equipe.
async function compararComABase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resultado: Awaited<ReturnType<typeof analisarKml>>,
  idAcao: string
): Promise<void> {
  const linhas = linhasDoResultado(resultado);
  if (linhas.length === 0 || !resultado.caixa) return;

  // Leitura pelo servidor: a tabela é restrita (Sobreposições é só para admin/chefe), mas o
  // resumo de "quais ações se sobrepõem" vale para qualquer pessoa aprovada.
  const { data: tracados } = await createAdminClient().from("obras_tracado").select("id_acao, wkt");
  const base: TracadoBase[] = (tracados ?? [])
    .filter((tr) => tr.id_acao !== idAcao)
    .map((tr) => ({ idAcao: tr.id_acao, fonte: "sobreposicoes" as const, linhas: wktParaLinhasLonLat(tr.wkt) }));

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

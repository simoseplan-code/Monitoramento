import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarKml, linhasDoResultado } from "@/lib/kml/analisar";
import { aplicarSobreposicoes, compararComBase, linhasParaWkt, wktParaLinhasLonLat, type TracadoBase } from "@/lib/kml/base";
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

  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
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

    // Compara com a base de traçados (outras ações) e guarda este KML para as próximas comparações.
    try {
      await compararEGuardar(supabase, resultado, idAcao, !!perfil?.is_admin, !arquivo);
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

async function compararEGuardar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resultado: Awaited<ReturnType<typeof analisarKml>>,
  idAcao: string,
  ehSupervisor: boolean,
  veioDoSimo: boolean
): Promise<void> {
  const linhas = linhasDoResultado(resultado);
  const caixa = resultado.caixa;
  if (linhas.length === 0 || !caixa) return;
  const admin = createAdminClient();
  const outra = (id: string) => !idAcao || id !== idAcao;

  const base: TracadoBase[] = [];

  // KMLs já analisados (qualquer pessoa aprovada): só os que cruzam a caixa deste KML.
  const { data: kmls } = await supabase
    .from("kml_acoes")
    .select("id_acao, wkt")
    .lte("min_lon", caixa.leste + 0.001)
    .gte("max_lon", caixa.oeste - 0.001)
    .lte("min_lat", caixa.norte + 0.001)
    .gte("max_lat", caixa.sul - 0.001);
  for (const k of kmls ?? []) if (outra(k.id_acao)) base.push({ idAcao: k.id_acao, fonte: "kml", linhas: wktParaLinhasLonLat(k.wkt) });

  // Traçados vindos do CSV de Sobreposições: só administrador/chefe (a equipe não acessa
  // Sobreposições por enquanto, então esse cruzamento também não vai para ela).
  if (ehSupervisor) {
    const { data: tracados } = await admin.from("obras_tracado").select("id_acao, wkt");
    for (const tr of tracados ?? []) {
      if (!outra(tr.id_acao) || base.some((b) => b.idAcao === tr.id_acao)) continue;
      base.push({ idAcao: tr.id_acao, fonte: "sobreposicoes", linhas: wktParaLinhasLonLat(tr.wkt) });
    }
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

  // Guarda o traçado deste KML (só quando veio do SIMO, para não misturar arquivos de teste).
  if (veioDoSimo && idAcao.length > 0 && idAcao.length <= 12 && Number.isInteger(Number(idAcao))) {
    let guardar = linhas;
    const pontos = guardar.reduce((s, l) => s + l.length, 0);
    if (pontos > 30000) {
      const passo = Math.ceil(pontos / 30000);
      guardar = guardar.map((l) => l.filter((_, k) => k % passo === 0 || k === l.length - 1)).filter((l) => l.length >= 2);
    }
    await admin.from("kml_acoes").upsert(
      {
        id_acao: idAcao,
        wkt: linhasParaWkt(guardar),
        extensao_km: resultado.extensaoKm,
        min_lon: caixa.oeste,
        min_lat: caixa.sul,
        max_lon: caixa.leste,
        max_lat: caixa.norte,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "id_acao" }
    );
  }
}

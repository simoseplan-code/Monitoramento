import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarKml } from "@/lib/kml/analisar";
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

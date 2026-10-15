import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analisarKml } from "@/lib/kml/analisar";

export const runtime = "nodejs";
export const maxDuration = 30;

const LIMITE_BYTES = 4 * 1024 * 1024; // a Vercel aceita até ~4,5 MB por envio

// Analisa um KML/KMZ anexado à ação: contagem de pontos e trechos, extensão, municípios,
// bairros e conferências com o nome da ação. O arquivo chega por upload.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  const idAcao = typeof form?.get("idAcao") === "string" ? (form!.get("idAcao") as string).trim() : "";
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo KML ou KMZ." }, { status: 400 });
  if (arquivo.size > LIMITE_BYTES) {
    return NextResponse.json({ error: `Arquivo grande demais (${(arquivo.size / 1048576).toFixed(1)} MB). O limite é 4 MB.` }, { status: 413 });
  }
  if (!/\.(kml|kmz)$/i.test(arquivo.name)) return NextResponse.json({ error: "O arquivo precisa ser .kml ou .kmz." }, { status: 400 });

  // O nome da ação vem da base (não do navegador), para a conferência de município e extensão.
  let nomeAcao: string | null = null;
  if (/^\d{1,12}$/.test(idAcao)) {
    const { data } = await supabase.from("obras").select("nome_acao").eq("id_acao", idAcao).maybeSingle();
    nomeAcao = data?.nome_acao ?? null;
  }

  try {
    const resultado = await analisarKml(Buffer.from(await arquivo.arrayBuffer()), arquivo.name.slice(0, 200), nomeAcao);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    // Mensagens de leitura (KML inválido, KMZ sem .kml) são claras para o usuário.
    const msg = e instanceof Error ? e.message : "";
    const amigavel = /KML|KMZ|zip/i.test(msg) ? msg : "Não consegui ler esse arquivo. Confira se é um KML ou KMZ válido.";
    console.error("analisar kml:", e);
    return NextResponse.json({ error: amigavel }, { status: 422 });
  }
}

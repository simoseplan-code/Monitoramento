import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvParaSobreposicoes } from "@/lib/sobreposicoes/parseCsv";
import { aplicarLocais, ErroImportacao } from "@/lib/sobreposicoes/importar";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Sobreposições é só para admin e chefe (a equipe fica de fora por enquanto).
  const { data: perfilAcesso } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!perfilAcesso?.is_admin) return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { csv?: unknown } | null;
  const csv = corpo?.csv;
  if (typeof csv !== "string" || !csv) return NextResponse.json({ error: "Nenhum CSV enviado." }, { status: 400 });
  if (csv.length > 20_000_000) return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 });

  let locais;
  try {
    locais = csvParaSobreposicoes(csv);
  } catch {
    return NextResponse.json({ error: "CSV inválido. Confira se é o arquivo do Mapa de Obras." }, { status: 400 });
  }
  if (locais.length === 0) {
    return NextResponse.json({ error: "Nenhum local sobreposto encontrado nesse CSV." }, { status: 400 });
  }

  try {
    const resumo = await aplicarLocais(supabase, locais);
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    if (e instanceof ErroImportacao) return NextResponse.json({ error: e.message }, { status: 500 });
    console.error("importar sobreposicoes:", e);
    return NextResponse.json({ error: "Falha ao salvar no banco." }, { status: 500 });
  }
}

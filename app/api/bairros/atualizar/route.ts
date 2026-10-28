import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atualizarBairros } from "@/lib/bairros/atualizar";

export const runtime = "nodejs";
export const maxDuration = 300;

// Calcula os bairros das ações com traçado novo ou alterado (o diário já faz isso sozinho; este
// botão serve para a primeira carga e para conferir na hora). Só admin e chefe.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  // Cada chamada trabalha uns 40 s e a tela chama de novo até acabar (evita estourar o tempo da função).
  const corpo = (await request.json().catch(() => null)) as { baixarMapa?: boolean; refazerTudo?: boolean } | null;
  const admin = createAdminClient();
  try {
    const r = await atualizarBairros(admin, { limiteMs: 40_000, baixarMapa: corpo?.baixarMapa !== false, refazerTudo: corpo?.refazerTudo === true });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bairros atualizar:", msg);
    return NextResponse.json({ error: `Falha ao calcular os bairros: ${msg}` }, { status: 500 });
  }
}

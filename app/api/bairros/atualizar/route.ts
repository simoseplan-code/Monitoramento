import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atualizarBairros } from "@/lib/bairros/atualizar";

export const runtime = "nodejs";
export const maxDuration = 300;

// Calcula os bairros das ações com traçado novo ou alterado (o diário já faz isso sozinho; este
// botão serve para a primeira carga e para conferir na hora). Só admin e chefe.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  try {
    const r = await atualizarBairros(createAdminClient(), { limiteMs: 240_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("bairros atualizar:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falha ao calcular os bairros. Se o SQL 0081 ainda não foi rodado, rode-o primeiro." }, { status: 500 });
  }
}

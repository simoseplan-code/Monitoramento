import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executarVinculacaoLote } from "@/lib/simo/vinculacao";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, status")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin || profile.status !== "aprovado") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const corpo = (await request.json().catch(() => ({}))) as { tentarTodas?: boolean };
    const resultado = await executarVinculacaoLote(user.id, corpo.tentarTodas === true);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

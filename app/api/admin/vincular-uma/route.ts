import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executarVinculacaoUnica } from "@/lib/simo/vinculacao";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
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

  const { idAcao } = (await request.json()) as { idAcao?: string };
  if (!idAcao) return NextResponse.json({ error: "idAcao é obrigatório." }, { status: 400 });

  try {
    const resultado = await executarVinculacaoUnica(idAcao, user.id);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

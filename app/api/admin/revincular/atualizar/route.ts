import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { atualizarPeloRelatorio } from "@/lib/simo/vinculacao";

export const runtime = "nodejs";
// O relatório do SIMO passa de 1 minuto para baixar (mesmo limite do download diário).
export const maxDuration = 300;

// Baixa o relatório do SIMO e atualiza, no painel, as ações informadas (e o "depois" da revinculação delas), admin e chefe.
// Só LÊ o SIMO.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!profile?.is_admin || profile.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  try {
    const corpo = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map((i) => String(i)) : [];
    if (ids.length === 0) return NextResponse.json({ error: "Nenhum ID informado." }, { status: 400 });
    const r = await atualizarPeloRelatorio(ids);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, { status: 500 });
  }
}

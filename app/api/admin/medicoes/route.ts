import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerMedicoesLote } from "@/lib/simo/medicoes";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lê no SIMO os boletins de medição das ações pedidas (admin e chefe). Cada chamada trata o que der em ~45s e devolve
// em "restantes" o que ficou: a tela manda de novo até acabar. Só lê o SIMO (nada é alterado lá).
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
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map((i) => String(i)).slice(0, 500) : [];
    if (ids.length === 0) return NextResponse.json({ error: "Nenhum ID informado." }, { status: 400 });
    const r = await lerMedicoesLote(ids);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro desconhecido." }, { status: 500 });
  }
}

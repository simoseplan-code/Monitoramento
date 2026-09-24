import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executarSyncSimo, executarSyncSugestoes } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // Duas etapas separadas (cada uma com seus 60s): body { fase: "sugestoes" }
  // roda só a fila de Unidade/Quantidade; sem fase roda o sync de obras.
  const { fase } = (await request.json().catch(() => ({}))) as { fase?: string };

  try {
    if (fase === "sugestoes") {
      const { naFila } = await executarSyncSugestoes();
      return NextResponse.json({ ok: true, fase, naFila });
    }
    const { linhas } = await executarSyncSimo();
    return NextResponse.json({ ok: true, fase: "obras", linhas });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

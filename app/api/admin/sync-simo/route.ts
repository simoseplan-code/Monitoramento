import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executarSyncBaixar, executarSyncObras, executarSyncSugestoes } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sync em camadas, uma por requisição (cada uma com os seus 60s):
//   fase "baixar"    — baixa o relatório do SIMO (a parte lenta) e guarda no banco
//   fase "obras"     — lê o relatório guardado e grava as obras
//   fase "sugestoes" — recalcula a fila de Unidade/Quantidade
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

  const { fase } = (await request.json().catch(() => ({}))) as { fase?: string };

  try {
    if (fase === "baixar") {
      const { kb } = await executarSyncBaixar();
      return NextResponse.json({ ok: true, fase, kb });
    }
    if (fase === "sugestoes") {
      const { naFila } = await executarSyncSugestoes();
      return NextResponse.json({ ok: true, fase, naFila });
    }
    const { linhas } = await executarSyncObras();
    return NextResponse.json({ ok: true, fase: "obras", linhas });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

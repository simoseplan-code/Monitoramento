import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: solicitante } = await supabase
    .from("profiles")
    .select("is_admin, status")
    .eq("id", user.id)
    .single();
  if (!solicitante?.is_admin || solicitante.status !== "aprovado") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { userId, acao } = await request.json();
  if (!userId || !["aprovar", "rejeitar"].includes(acao)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      status: acao === "aprovar" ? "aprovado" : "rejeitado",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: "Falha ao atualizar cadastro." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

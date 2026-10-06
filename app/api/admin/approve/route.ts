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
    .select("papel, status")
    .eq("id", user.id)
    .single();
  // Aprovar/rejeitar cadastro é alterar acesso: só administrador (chefe não).
  if (solicitante?.papel !== "admin" || solicitante.status !== "aprovado") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { userId, acao, papel } = await request.json();
  if (!userId || !["aprovar", "rejeitar"].includes(acao)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  // Evita o admin se trancar pra fora rejeitando a própria conta.
  if (userId === user.id) return NextResponse.json({ error: "Você não pode alterar o próprio cadastro." }, { status: 400 });

  const admin = createAdminClient();

  // Primeiro o acesso no Supabase Auth, depois o status: se algo falhar no meio, a
  // pessoa continua na lista de pendentes e dá pra tentar de novo.
  const { error: erroAcesso } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: acao === "aprovar" ? "none" : "876000h",
  });
  if (erroAcesso) return NextResponse.json({ error: "Falha ao ajustar o acesso da conta. Tente de novo." }, { status: 500 });

  const { error } = await admin
    .from("profiles")
    .update({
      ...(acao === "aprovar" && ["admin", "chefe", "equipe"].includes(papel) ? { papel } : {}),
      status: acao === "aprovar" ? "aprovado" : "rejeitado",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: "Falha ao atualizar cadastro." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

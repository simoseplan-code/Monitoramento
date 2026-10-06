import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PAPEIS = ["admin", "chefe", "equipe"] as const;

// Troca a função (admin, chefe ou equipe) de uma pessoa. Só administrador; chefe vê
// a lista mas não altera acesso. O próprio admin não muda a própria função (evita
// ficar sem nenhum administrador), e o banco também barra quem não é admin.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: solicitante } = await supabase.from("profiles").select("papel, status").eq("id", user.id).single();
  if (solicitante?.papel !== "admin" || solicitante.status !== "aprovado") {
    return NextResponse.json({ error: "Só administrador altera acessos." }, { status: 403 });
  }

  const { userId, papel } = (await request.json()) as { userId?: string; papel?: string };
  if (!userId || !PAPEIS.includes(papel as (typeof PAPEIS)[number])) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "Você não pode alterar a sua própria função." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: alvo } = await admin.from("profiles").select("id, nome, status").eq("id", userId).maybeSingle();
  if (!alvo || alvo.status !== "aprovado") {
    return NextResponse.json({ error: "Só dá para mudar a função de quem já está aprovado." }, { status: 400 });
  }

  const { error } = await admin.from("profiles").update({ papel }).eq("id", userId);
  if (error) return NextResponse.json({ error: "Falha ao alterar a função." }, { status: 500 });
  return NextResponse.json({ ok: true, papel });
}

import { randomInt } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sem caracteres que se confundem (0/O, 1/l/I) para ditar a senha sem erro.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function senhaProvisoria(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

// Reseta a senha de uma pessoa. Só administrador. A senha provisória aparece uma
// única vez para o admin repassar; no próximo acesso a pessoa cadastra uma nova.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: solicitante } = await supabase.from("profiles").select("papel, status").eq("id", user.id).single();
  if (solicitante?.papel !== "admin" || solicitante.status !== "aprovado") {
    return NextResponse.json({ error: "Só administrador reseta senha." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = corpo?.userId;
  if (typeof userId !== "string" || !userId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "Para a sua própria senha, use a troca normal." }, { status: 400 });

  const admin = createAdminClient();
  const { data: alvo } = await admin.from("profiles").select("id, status").eq("id", userId).maybeSingle();
  if (!alvo || alvo.status !== "aprovado") {
    return NextResponse.json({ error: "Só dá para resetar a senha de quem está aprovado." }, { status: 400 });
  }

  const senha = senhaProvisoria();
  const { error: erroSenha } = await admin.auth.admin.updateUserById(userId, { password: senha });
  if (erroSenha) return NextResponse.json({ error: "Não foi possível resetar a senha." }, { status: 500 });

  const { error } = await admin
    .from("profiles")
    .update({ trocar_senha: true, failed_login_attempts: 0, locked_until: null })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: "Senha trocada, mas falhou ao exigir a nova senha. Tente de novo." }, { status: 500 });

  return NextResponse.json({ ok: true, senha });
}

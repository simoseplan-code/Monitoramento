import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_RECUPERACAO, marcaRecuperacaoValida } from "@/lib/recuperacao";

// Nova senha de quem chegou pelo link do e-mail. Exige a marca assinada que a rota
// /auth/confirmar grava, então uma sessão comum aberta não basta para trocar a senha.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "O link expirou. Peça um novo." }, { status: 401 });

  if (!marcaRecuperacaoValida(request.cookies.get(COOKIE_RECUPERACAO)?.value, user.id)) {
    return NextResponse.json({ error: "O link expirou. Peça um novo." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as { senha?: unknown } | null;
  const senha = corpo?.senha;
  if (typeof senha !== "string" || senha.length < 10 || senha.length > 200) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 10 caracteres." }, { status: 400 });
  }
  if (user.email && senha.toLowerCase().includes(user.email.split("@")[0].toLowerCase())) {
    return NextResponse.json({ error: "A senha não pode conter o seu e-mail." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: senha });
  if (error) return NextResponse.json({ error: "Não foi possível salvar a nova senha." }, { status: 500 });

  // Senha nova: zera bloqueio por tentativas e qualquer troca obrigatória pendente.
  await admin.from("profiles").update({ failed_login_attempts: 0, locked_until: null, trocar_senha: false }).eq("id", user.id);

  // Encerra todas as sessões (inclusive esta): a pessoa entra de novo com a senha nova.
  await supabase.auth.signOut({ scope: "global" });

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_RECUPERACAO, "", { path: "/", maxAge: 0 });
  return resposta;
}

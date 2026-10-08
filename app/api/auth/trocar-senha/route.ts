import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Nova senha depois de um reset feito pelo administrador.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("trocar_senha").eq("id", user.id).single();
  if (!perfil?.trocar_senha) return NextResponse.json({ error: "Não há troca de senha pendente." }, { status: 400 });

  const corpo = (await request.json().catch(() => null)) as { senha?: unknown } | null;
  const senha = corpo?.senha;
  if (typeof senha !== "string" || senha.length < 10 || senha.length > 200) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 10 caracteres." }, { status: 400 });
  }
  if (user.email && senha.toLowerCase().includes(user.email.split("@")[0].toLowerCase())) {
    return NextResponse.json({ error: "A senha não pode conter o seu e-mail." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: erroSenha } = await admin.auth.admin.updateUserById(user.id, { password: senha });
  if (erroSenha) return NextResponse.json({ error: "Não foi possível salvar a nova senha." }, { status: 500 });

  const { error } = await admin.from("profiles").update({ trocar_senha: false }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Falha ao concluir a troca. Tente de novo." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

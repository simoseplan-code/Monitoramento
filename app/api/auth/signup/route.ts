import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ip";
import { verificarTurnstile } from "@/lib/turnstile";

// ~100 anos: na prática, bloqueado até alguém aprovar.
const BLOQUEIO_PENDENTE = "876000h";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { nome, email, senha, turnstileToken } = await request.json();

  if (!nome || !email || !senha) {
    return NextResponse.json({ error: "Preencha nome, email e senha." }, { status: 400 });
  }
  if (String(senha).length < 10) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 10 caracteres." }, { status: 400 });
  }

  const captcha = await verificarTurnstile(turnstileToken, ip, request.headers.get("host"));
  if (captcha === "indisponivel") {
    return NextResponse.json({ error: "Verificação de segurança indisponível no momento. Tente de novo em instantes ou avise o administrador." }, { status: 503 });
  }
  if (captcha !== "ok") {
    return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: rateOk } = await admin.rpc("check_rate_limit", {
    p_chave: `signup:${ip}`,
    p_limite: 5,
    p_janela_minutos: 10,
  });
  if (!rateOk) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // confirmação por email desligada: aprovação manual é quem valida a identidade
    user_metadata: { nome },
  });

  if (error || !criado.user) {
    return NextResponse.json({ error: "Não foi possível criar o cadastro. O email já pode estar em uso." }, { status: 400 });
  }

  // A conta nasce BLOQUEADA no Supabase Auth até um admin aprovar: sem login não
  // existe sessão, então quem ainda não foi aprovado não consegue nem chamar a
  // API do banco direto. Se o bloqueio falhar, desfaz o cadastro (nunca deixa uma
  // conta pendente destravada).
  const { error: erroBloqueio } = await admin.auth.admin.updateUserById(criado.user.id, { ban_duration: BLOQUEIO_PENDENTE });
  if (erroBloqueio) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json({ error: "Não foi possível concluir o cadastro agora. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

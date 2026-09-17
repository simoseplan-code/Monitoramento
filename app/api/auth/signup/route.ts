import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ip";
import { verificarTurnstile } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { nome, email, senha, turnstileToken } = await request.json();

  if (!nome || !email || !senha) {
    return NextResponse.json({ error: "Preencha nome, email e senha." }, { status: 400 });
  }
  if (String(senha).length < 8) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const captchaOk = await verificarTurnstile(turnstileToken, ip);
  if (!captchaOk) {
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

  const { error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // confirmação por email desligada: aprovação manual é quem valida a identidade
    user_metadata: { nome },
  });

  if (error) {
    return NextResponse.json({ error: "Não foi possível criar o cadastro. O email já pode estar em uso." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

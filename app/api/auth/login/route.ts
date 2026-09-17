import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ip";
import { verificarTurnstile } from "@/lib/turnstile";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { email, senha, turnstileToken } = await request.json();

  if (!email || !senha) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }

  const captchaOk = await verificarTurnstile(turnstileToken, ip);
  if (!captchaOk) {
    return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: rateOk } = await admin.rpc("check_rate_limit", {
    p_chave: `login:${ip}`,
    p_limite: 10,
    p_janela_minutos: 10,
  });
  if (!rateOk) {
    return NextResponse.json(
      { error: "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, locked_until, failed_login_attempts, status")
    .eq("email", email)
    .maybeSingle();

  if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
    return NextResponse.json(
      { error: "Conta temporariamente bloqueada por muitas tentativas erradas. Tente novamente mais tarde." },
      { status: 423 }
    );
  }

  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    if (profile) {
      const tentativas = (profile.failed_login_attempts ?? 0) + 1;
      const bloquear = tentativas >= MAX_TENTATIVAS;
      await admin
        .from("profiles")
        .update({
          failed_login_attempts: bloquear ? 0 : tentativas,
          locked_until: bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000).toISOString() : null,
        })
        .eq("id", profile.id);
    }
    return NextResponse.json({ error: "Email ou senha inválidos." }, { status: 401 });
  }

  if (profile && (profile.failed_login_attempts ?? 0) > 0) {
    await admin.from("profiles").update({ failed_login_attempts: 0, locked_until: null }).eq("id", profile.id);
  }

  // Sessão criada mesmo se ainda "pendente" — o middleware redireciona
  // esse usuário para /pendente em qualquer rota interna.
  return response;
}

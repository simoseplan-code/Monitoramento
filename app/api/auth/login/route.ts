import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ip";
import { verificarTurnstile } from "@/lib/turnstile";

// Com SUPABASE_CAPTCHA_ATIVO=1 o captcha passa a ser conferido pelo PRÓPRIO Supabase
// (Authentication → Attack Protection), o que também barra quem tenta senhas direto na
// API pública, sem passar por aqui. O token do checkbox só vale uma vez, então nesse
// modo ele é repassado ao Supabase em vez de ser conferido duas vezes.
const CAPTCHA_NO_SUPABASE = process.env.SUPABASE_CAPTCHA_ATIVO === "1";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const corpo = (await request.json().catch(() => ({}))) as { email?: unknown; senha?: unknown; turnstileToken?: unknown };
  const { email, senha, turnstileToken } = corpo as { email: string; senha: string; turnstileToken: string };

  if (typeof email !== "string" || typeof senha !== "string" || !email || !senha || email.length > 254 || senha.length > 200) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }

  if (CAPTCHA_NO_SUPABASE) {
    if (!turnstileToken) {
      return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
    }
  } else {
    const captcha = await verificarTurnstile(turnstileToken, ip, request.headers.get("host"));
    if (captcha === "indisponivel") {
      return NextResponse.json({ error: "Verificação de segurança indisponível no momento. Tente de novo em instantes ou avise o administrador." }, { status: 503 });
    }
    if (captcha !== "ok") {
      return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
    }
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

  const { data: login, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
    ...(CAPTCHA_NO_SUPABASE ? { options: { captchaToken: turnstileToken } } : {}),
  });

  // Captcha reprovado pelo Supabase: não conta como senha errada.
  if (error && (error.code === "captcha_failed" || /captcha/i.test(error.message))) {
    return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
  }

  // Conta bloqueada no Supabase = cadastro ainda não aprovado (ou rejeitado).
  if (error && (error.code === "user_banned" || /banned/i.test(error.message))) {
    return NextResponse.json(
      {
        error:
          profile?.status === "rejeitado"
            ? "Seu cadastro não foi aprovado. Procure o administrador."
            : "Seu cadastro está aguardando aprovação do administrador. Você poderá entrar assim que for liberado.",
      },
      { status: 403 }
    );
  }

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

  // Uma sessão ativa por conta: entrar aqui derruba as sessões abertas em
  // outros navegadores/computadores (conta da empresa usada em vários PCs).
  if (login.session?.access_token) {
    await admin.auth.admin.signOut(login.session.access_token, "others");
  }

  // Sessão criada mesmo se ainda "pendente", o middleware redireciona
  // esse usuário para /pendente em qualquer rota interna.
  return response;
}

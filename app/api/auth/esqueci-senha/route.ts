import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ip";
import { verificarTurnstile } from "@/lib/turnstile";
import { emailConfigurado, emailRecuperacao, enderecoDoPainel, enviarEmail } from "@/lib/email";

// A resposta é sempre a mesma, exista a conta ou não, para não revelar quem tem cadastro.
const RESPOSTA_OK = { ok: true };

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const corpo = (await request.json().catch(() => ({}))) as { email?: unknown; turnstileToken?: unknown };
  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const token = typeof corpo.turnstileToken === "string" ? corpo.turnstileToken : "";

  if (!email || email.length > 254 || !email.includes("@")) {
    return NextResponse.json({ error: "Informe o seu e-mail." }, { status: 400 });
  }

  // O link é gerado e enviado por aqui (não pelo Supabase), então o checkbox é conferido
  // só por nós, uma vez.
  const captcha = await verificarTurnstile(token, ip, request.headers.get("host"));
  if (captcha === "indisponivel") {
    return NextResponse.json({ error: "Verificação de segurança indisponível no momento. Tente de novo em instantes." }, { status: 503 });
  }
  if (captcha !== "ok") {
    return NextResponse.json({ error: "Falha na verificação de segurança. Tente novamente." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Limites: por IP (qualquer e-mail) e por e-mail (para ninguém encher a caixa de outra pessoa).
  const [{ data: ipOk }, { data: emailOk }] = await Promise.all([
    admin.rpc("check_rate_limit", { p_chave: `reset-ip:${ip}`, p_limite: 5, p_janela_minutos: 15 }),
    admin.rpc("check_rate_limit", { p_chave: `reset-email:${email}`, p_limite: 3, p_janela_minutos: 60 }),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json({ error: "Muitos pedidos seguidos. Aguarde um pouco e tente de novo." }, { status: 429 });
  }

  // Só quem já foi aprovado recebe o e-mail (pendente e rejeitado ficam bloqueados).
  const { data: perfil } = await admin.from("profiles").select("status").eq("email", email).maybeSingle();
  if (perfil?.status !== "aprovado") return NextResponse.json(RESPOSTA_OK);

  const painel = enderecoDoPainel();
  if (!emailConfigurado() || !painel) {
    console.error("esqueci-senha: e-mail não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS e APP_URL).");
    return NextResponse.json(RESPOSTA_OK);
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) throw new Error(error?.message ?? "sem token");

    const link = `${painel}/auth/confirmar?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
    const { assunto, texto, html } = emailRecuperacao(link);
    await enviarEmail(email, assunto, texto, html);
  } catch (e) {
    // Não conta ao usuário (evita revelar a conta), mas fica no log do servidor.
    console.error("esqueci-senha:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json(RESPOSTA_OK);
}

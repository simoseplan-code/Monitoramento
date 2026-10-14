import nodemailer from "nodemailer";

// Envio pela conta de e-mail própria do sistema (SMTP), sem depender do e-mail do Supabase
// (que limita poucos envios por hora). Variáveis: SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS e, opcionalmente, SMTP_FROM.
export function emailConfigurado(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Endereço do painel usado nos links dos e-mails. Nunca vem do pedido (evita link forjado). */
export function enderecoDoPainel(): string | null {
  const fixo = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixo) return fixo;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export async function enviarEmail(para: string, assunto: string, texto: string, html: string): Promise<void> {
  const porta = Number(process.env.SMTP_PORT || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporte.sendMail({
    from: process.env.SMTP_FROM || `Monitoramento de Obras <${process.env.SMTP_USER}>`,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

export function emailRecuperacao(link: string): { assunto: string; texto: string; html: string } {
  const assunto = "Redefinir a senha do Monitoramento de Obras";
  const texto =
    `Recebemos um pedido para criar uma nova senha no Monitoramento de Obras.\n\n` +
    `Abra o link abaixo para escolher a nova senha (vale por pouco tempo e só funciona uma vez):\n${link}\n\n` +
    `Se não foi você, ignore este e-mail: nada será alterado.`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:480px;color:#1e293b">` +
    `<h2 style="margin:0 0 12px">Redefinir senha</h2>` +
    `<p>Recebemos um pedido para criar uma nova senha no Monitoramento de Obras.</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Escolher nova senha</a></p>` +
    `<p style="font-size:13px;color:#64748b">O link vale por pouco tempo e só funciona uma vez. Se não foi você, ignore este e-mail: nada será alterado.</p>` +
    `</div>`;
  return { assunto, texto, html };
}

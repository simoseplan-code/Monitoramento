import { createHmac, timingSafeEqual } from "crypto";

// Cookie assinado que prova que a pessoa chegou na tela "nova senha" pelo link do
// e-mail (e não só com uma sessão qualquer aberta). Vale poucos minutos.
export const COOKIE_RECUPERACAO = "pw_reset";
export const VALIDADE_RECUPERACAO_S = 15 * 60;

function assinar(userId: string, expira: number): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    .update(`${userId}.${expira}`)
    .digest("hex");
}

export function gerarMarcaRecuperacao(userId: string): string {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_RECUPERACAO_S;
  return `${userId}.${expira}.${assinar(userId, expira)}`;
}

export function marcaRecuperacaoValida(valor: string | undefined, userId: string): boolean {
  if (!valor || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const [id, expiraTxt, assinatura] = valor.split(".");
  const expira = Number(expiraTxt);
  if (id !== userId || !Number.isFinite(expira) || expira < Date.now() / 1000 || !assinatura) return false;
  const esperado = assinar(userId, expira);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

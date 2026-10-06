export type ResultadoCaptcha = "ok" | "invalido" | "indisponivel";

// Falha FECHADA: em produção, sem a chave secreta o captcha NÃO é ignorado -
// recusa tudo e avisa que a configuração está faltando (antes, uma variável
// vazia na Vercel desligava o captcha em silêncio). Só fora de produção (dev
// local sem chave) ele fica liberado.
export async function verificarTurnstile(token: string | undefined, ip: string, host?: string | null): Promise<ResultadoCaptcha> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return "ok";
    console.error("TURNSTILE_SECRET_KEY ausente em produção: login e cadastro bloqueados até configurar.");
    return "indisponivel";
  }
  if (!token) return "invalido";

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await resp.json()) as { success?: boolean; hostname?: string };
    if (data.success !== true) return "invalido";

    // O token precisa ter sido gerado no nosso próprio site, não em outro
    // que use a mesma chave.
    if (host && data.hostname) {
      const esperado = host.split(":")[0].toLowerCase();
      if (data.hostname.toLowerCase() !== esperado) return "invalido";
    }
    return "ok";
  } catch {
    // Cloudflare fora do ar ou lento: por segurança não libera.
    return "indisponivel";
  }
}

/** Texto livre vindo do usuário: só string, sem espaços nas pontas, com tamanho máximo. */
export function limparTexto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim().slice(0, max);
  return t || null;
}

/**
 * Termo de busca que entra num filtro `.or(...)` do PostgREST. Vírgula, parênteses,
 * aspas, asterisco e porcentagem têm significado no filtro (permitiriam acrescentar
 * condições), então saem do texto.
 */
export function sanitizarBusca(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/[,()"'\\*%_:.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Pedido que muda dados só vale se vier do próprio painel (defesa contra CSRF). */
export function origemConfiavel(origin: string | null, host: string | null): boolean {
  if (!origin) return true; // navegador não manda Origin em GET simples; scripts de servidor também não
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

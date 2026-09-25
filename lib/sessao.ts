// Tempo máximo de uma sessão, contado desde o último login com senha
// (não desde a última atividade). O Supabase por padrão mantém a sessão
// por meses no navegador — com perfil de navegador compartilhado entre
// computadores da empresa, outra pessoa abria o painel já logada.
export const SESSAO_MAX_HORAS = 12;

export function sessaoExpirada(ultimoLoginEm: string | undefined | null): boolean {
  if (!ultimoLoginEm) return false;
  const horas = (Date.now() - new Date(ultimoLoginEm).getTime()) / 3_600_000;
  return horas > SESSAO_MAX_HORAS;
}

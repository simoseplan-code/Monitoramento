import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A análise de uma sobreposição vale para o PAR de obras ("ID x ID"), não para cada trecho.
 * Dado o local que a tela mostra, devolve a chave de TODOS os locais (trechos) com as mesmas obras,
 * para a decisão ser gravada em todos de uma vez. Usa o cliente de serviço (admin).
 */
export async function chavesDoPar(admin: SupabaseClient, chaveLocal: string): Promise<string[]> {
  const { data: local } = await admin.from("sobreposicoes").select("chave_obras").eq("chave_local", chaveLocal).maybeSingle();
  const chaveObras = (local?.chave_obras as string | null) ?? null;
  if (!chaveObras) return [chaveLocal];
  const { data } = await admin.from("sobreposicoes").select("chave_local").eq("chave_obras", chaveObras);
  return Array.from(new Set([chaveLocal, ...((data ?? []) as { chave_local: string }[]).map((r) => r.chave_local)]));
}

/**
 * A tela lê a tabela pronta `sobreposicoes_pares`: depois de mudar a análise de um par, refaz só o registro dele.
 * Não derruba a ação se falhar (a próxima sincronização refaz tudo), só registra no log.
 */
export async function reconstruirPar(admin: SupabaseClient, chaveLocal: string): Promise<void> {
  try {
    const { data: local } = await admin.from("sobreposicoes").select("chave_obras").eq("chave_local", chaveLocal).maybeSingle();
    const grupo = ((local?.chave_obras as string | null) ?? null) || chaveLocal;
    const { error } = await admin.rpc("sobreposicoes_reconstruir_pares", { so_grupo: grupo });
    if (error) console.error("reconstruir par de sobreposição:", error.message);
  } catch (e) {
    console.error("reconstruir par de sobreposição:", e instanceof Error ? e.message : e);
  }
}

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

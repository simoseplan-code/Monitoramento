import type { SupabaseClient } from "@supabase/supabase-js";

// Mesmo racional de lib/novasAcoes.ts / lib/unidadeQuantidade.ts: conta
// no Postgres (barato mesmo com a base crescendo) em vez de trazer as
// linhas pro Next.js só pro badge do menu.
export async function contarVinculacaoPendentes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("contar_vinculacao_pendentes_validas");
  if (error) return 0;
  return data ?? 0;
}

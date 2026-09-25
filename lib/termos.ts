import type { SupabaseClient } from "@supabase/supabase-js";

// Mesmo racional de lib/novasAcoes.ts: conta no Postgres, barato mesmo
// com a base crescendo (badge do menu).
export async function contarTermosPendentes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("contar_termos_pendentes");
  if (error) return 0;
  return data ?? 0;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Conta direto no Postgres (função contar_sugestoes_unidade_pendentes)
// em vez de trazer as linhas pro Next.js — mesma razão de
// lib/novasAcoes.ts: essa contagem roda em toda página (badge do menu
// lateral), tem que ser barata mesmo com a base crescendo.
export async function contarSugestoesUnidadePendentes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("contar_sugestoes_unidade_pendentes");
  if (error) return 0;
  return data ?? 0;
}

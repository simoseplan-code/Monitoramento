import type { SupabaseClient } from "@supabase/supabase-js";

// Ações criadas antes disso nunca entram na revisão "Novas Ações" — só
// interessa o que passou a ser cadastrado a partir do dia em que essa
// checklist entrou no ar, não o histórico acumulado de anos no SIMO.
export const DATA_INICIO_REVISAO = "2026-09-17";

// Ação conveniada (Federal ou Estadual) fica fora da revisão — quem
// cuida da conferência dela é o órgão conveniado, não a nossa equipe.
export function ehConveniada(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim().toUpperCase();
  return v === "FEDERAL" || v === "ESTADUAL";
}

// Conta direto no Postgres (função contar_novas_acoes_pendentes) em vez
// de trazer as linhas pro Next.js — essa contagem roda em toda página
// (badge do menu lateral), então precisa ser barata mesmo com a base
// crescendo.
export async function contarNovasAcoesPendentes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("contar_novas_acoes_pendentes", {
    data_inicio: DATA_INICIO_REVISAO,
  });
  if (error) return 0;
  return data ?? 0;
}

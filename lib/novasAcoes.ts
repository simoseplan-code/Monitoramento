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

export async function contarNovasAcoesPendentes(supabase: SupabaseClient): Promise<number> {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const limite = ontem.toISOString().slice(0, 10);

  const [{ data: obrasBrutas }, { data: revisoes }] = await Promise.all([
    supabase
      .from("obras")
      .select("id_acao, acao_conveniada")
      .gte("data_criacao", DATA_INICIO_REVISAO)
      .lte("data_criacao", limite)
      .limit(5000),
    supabase
      .from("obras_revisao")
      .select("id_acao, kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios"),
  ]);

  const obras = (obrasBrutas ?? []).filter((o) => !ehConveniada(o.acao_conveniada));
  const revisaoPorId = new Map((revisoes ?? []).map((r) => [r.id_acao, r]));
  const confirmado = (v: string | undefined) => v === "confirmado";

  return obras.filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    return !r || !confirmado(r.kml_anexado) || !confirmado(r.sem_duplicacao) || !confirmado(r.trecho_unico) || !confirmado(r.documentos_obrigatorios);
  }).length;
}

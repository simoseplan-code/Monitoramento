import type { SupabaseClient } from "@supabase/supabase-js";

// Ações criadas antes disso nunca entram na revisão "Novas Ações" — só
// interessa o que passou a ser cadastrado a partir do dia em que essa
// checklist entrou no ar, não o histórico acumulado de anos no SIMO.
export const DATA_INICIO_REVISAO = "2026-09-17";

export async function contarNovasAcoesPendentes(supabase: SupabaseClient): Promise<number> {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const limite = ontem.toISOString().slice(0, 10);

  const [{ data: obras }, { data: revisoes }] = await Promise.all([
    supabase
      .from("obras")
      .select("id_acao")
      .gte("data_criacao", DATA_INICIO_REVISAO)
      .lte("data_criacao", limite)
      .limit(5000),
    supabase
      .from("obras_revisao")
      .select("id_acao, kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios"),
  ]);

  const revisaoPorId = new Map((revisoes ?? []).map((r) => [r.id_acao, r]));
  const confirmado = (v: string | undefined) => v === "confirmado";

  return (obras ?? []).filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    return !r || !confirmado(r.kml_anexado) || !confirmado(r.sem_duplicacao) || !confirmado(r.trecho_unico) || !confirmado(r.documentos_obrigatorios);
  }).length;
}

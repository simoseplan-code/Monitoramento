import type { SupabaseClient } from "@supabase/supabase-js";

export async function contarNovasAcoesPendentes(supabase: SupabaseClient): Promise<number> {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const limite = ontem.toISOString().slice(0, 10);

  const [{ data: obras }, { data: revisoes }] = await Promise.all([
    supabase.from("obras").select("id_acao").lte("data_criacao", limite).limit(5000),
    supabase
      .from("obras_revisao")
      .select("id_acao, kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios"),
  ]);

  const revisaoPorId = new Map((revisoes ?? []).map((r) => [r.id_acao, r]));

  return (obras ?? []).filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    return !r || !r.kml_anexado || !r.sem_duplicacao || !r.trecho_unico || !r.documentos_obrigatorios;
  }).length;
}

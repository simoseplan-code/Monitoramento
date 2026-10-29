import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// IDs que a equipe decidiu DESCONSIDERAR das análises (tabela acoes_desconsideradas).
// Uma lista por análise (tela) e uma lista "todas", que vale para todas as análises.

import { TELAS_DESCONSIDERADAS } from "@/lib/desconsideradasTelas";
export { TELAS_DESCONSIDERADAS };
export type { ChaveTela } from "@/lib/desconsideradasTelas";

export type DesconsideradaComDetalhe = {
  id: string;
  em: string;
  por: string | null;
  nome: string | null;
  orgao: string | null;
  status: string | null;
};

/** As linhas de uma ou mais listas, com nome, órgão e status da ação. */
export async function listarDesconsideradas(supabase: SupabaseClient, telas: string[]): Promise<(DesconsideradaComDetalhe & { tela: string })[]> {
  const linhas: { tela: string; id: string; em: string; por: string | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("acoes_desconsideradas")
      .select("tela, id_acao, desconsiderada_em, por_nome")
      .in("tela", telas)
      .order("id_acao")
      .range(de, de + 999);
    if (error) break; // se o SQL ainda não rodou, segue sem a lista
    for (const r of data ?? []) linhas.push({ tela: r.tela as string, id: r.id_acao as string, em: r.desconsiderada_em as string, por: (r.por_nome as string | null) ?? null });
    if (!data || data.length < 1000) break;
  }
  const ids = Array.from(new Set(linhas.map((l) => l.id)));
  const info = new Map<string, { nome: string | null; orgao: string | null; status: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    // Base completa (as ações da lista "Todas" ficam escondidas para o acesso comum).
    const { data } = await createAdminClient().from("obras").select("id_acao, nome_acao, orgao, status").in("id_acao", ids.slice(i, i + 200));
    for (const o of data ?? []) info.set(o.id_acao as string, { nome: (o.nome_acao as string | null) ?? null, orgao: (o.orgao as string | null) ?? null, status: (o.status as string | null) ?? null });
  }
  return linhas.map((l) => ({ ...l, nome: info.get(l.id)?.nome ?? null, orgao: info.get(l.id)?.orgao ?? null, status: info.get(l.id)?.status ?? null }));
}

/** Só os IDs que valem para uma análise: os da própria lista e os da lista "todas". */
export async function idsDesconsiderados(supabase: SupabaseClient, tela: string): Promise<string[]> {
  const ids: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao").in("tela", [tela, "todas"]).order("id_acao").range(de, de + 999);
    if (error) break;
    ids.push(...(data ?? []).map((r) => r.id_acao as string));
    if (!data || data.length < 1000) break;
  }
  return Array.from(new Set(ids));
}

/** Só os IDs de uma lista (sem detalhes da ação). */
export async function idsDaLista(supabase: SupabaseClient, tela: string): Promise<string[]> {
  const ids: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao").eq("tela", tela).order("id_acao").range(de, de + 999);
    if (error) break;
    ids.push(...(data ?? []).map((r) => r.id_acao as string));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

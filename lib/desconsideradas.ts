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
  eixo: string | null;
  /** "filha" = entrou sozinha por ser ação filha na Configuração de TD (SQL 0092); "manual" = alguém desconsiderou. */
  origem: "manual" | "filha";
};

/** As linhas de uma ou mais listas, com nome, órgão e status da ação. */
export async function listarDesconsideradas(supabase: SupabaseClient, telas: string[]): Promise<(DesconsideradaComDetalhe & { tela: string })[]> {
  const linhas: { tela: string; id: string; em: string; por: string | null; origem: "manual" | "filha" }[] = [];
  let colunas = "tela, id_acao, desconsiderada_em, por_nome, origem";
  for (let de = 0; ; de += 1000) {
    let { data, error } = await supabase.from("acoes_desconsideradas").select(colunas).in("tela", telas).order("id_acao").range(de, de + 999);
    if (error && colunas.includes("origem")) {
      // O SQL 0092 (coluna origem) ainda não rodou: lê sem ela.
      colunas = "tela, id_acao, desconsiderada_em, por_nome";
      ({ data, error } = await supabase.from("acoes_desconsideradas").select(colunas).in("tela", telas).order("id_acao").range(de, de + 999));
    }
    if (error) break; // se o SQL ainda não rodou, segue sem a lista
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) linhas.push({ tela: r.tela as string, id: r.id_acao as string, em: r.desconsiderada_em as string, por: (r.por_nome as string | null) ?? null, origem: r.origem === "filha" ? "filha" : "manual" });
    if (!data || data.length < 1000) break;
  }
  const ids = Array.from(new Set(linhas.map((l) => l.id)));
  const info = new Map<string, { nome: string | null; orgao: string | null; status: string | null; eixo: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    // Base completa (as ações da lista "Todas" ficam escondidas para o acesso comum).
    const { data } = await createAdminClient().from("obras").select("id_acao, nome_acao, orgao, status, eixo:extra->>EIXO").in("id_acao", ids.slice(i, i + 200));
    for (const o of data ?? []) info.set(o.id_acao as string, { nome: (o.nome_acao as string | null) ?? null, orgao: (o.orgao as string | null) ?? null, status: (o.status as string | null) ?? null, eixo: ((o as { eixo?: string | null }).eixo ?? null) || null });
  }
  return linhas.map((l) => ({ ...l, nome: info.get(l.id)?.nome ?? null, orgao: info.get(l.id)?.orgao ?? null, status: info.get(l.id)?.status ?? null, eixo: info.get(l.id)?.eixo ?? null }));
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

/** Os IDs de várias listas juntas (ex.: "todas" e a da análise). */
export async function idsDeListas(supabase: SupabaseClient, telas: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao").in("tela", telas).order("id_acao").range(de, de + 999);
    if (error) break;
    ids.push(...(data ?? []).map((r) => r.id_acao as string));
    if (!data || data.length < 1000) break;
  }
  return Array.from(new Set(ids));
}

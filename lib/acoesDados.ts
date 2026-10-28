import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contagemVinculacao,
  descreverFiltros,
  estadoDeGravado,
  estadoPadrao,
  filtrar,
  valoresDosFiltros,
  type AcaoLinha,
} from "@/lib/acoesFiltro";

const COLUNAS = "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, acao_conveniada, percentual_execucao, numero_automatico, numero_siafe, data_criacao";

type Linha = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  acao_conveniada: string | null;
  percentual_execucao: number | string | null;
  numero_automatico: string | null;
  numero_siafe: string | null;
  data_criacao: string | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export const paraAcao = (l: Linha): AcaoLinha => ({
  id: l.id_acao,
  nome: l.nome_acao ?? "",
  orgao: l.orgao,
  status: l.status,
  estagio: l.estagio_atual,
  tipologia: l.tipologia,
  classificacao: l.classificacao,
  conveniada: l.acao_conveniada,
  pct: numero(l.percentual_execucao),
  numeroAutomatico: l.numero_automatico,
  numeroSiafe: l.numero_siafe,
  criadaEm: l.data_criacao,
});

/** Todas as ações, lidas em páginas de 1000. */
export async function carregarAcoes(supabase: SupabaseClient): Promise<{ acoes: AcaoLinha[]; erro: string | null }> {
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("obras").select(COLUNAS).order("id_acao").range(de, de + 999);
    if (error) return { acoes: [], erro: error.message };
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return { acoes: linhas.map(paraAcao), erro: null };
}

/** Aplica o filtro enviado pela tela e devolve o que o PDF precisa. */
export function montarListagem(acoes: AcaoLinha[], estadoEnviado: unknown) {
  const valores = valoresDosFiltros(acoes);
  const estado = estadoEnviado ? estadoDeGravado(estadoEnviado, valores) : estadoPadrao();
  const filtradas = filtrar(acoes, estado).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    totalNaBase: acoes.length,
    filtradas,
    contagem: contagemVinculacao(filtradas),
    filtros: descreverFiltros(estado, valores),
  };
}

export type ListagemMontada = ReturnType<typeof montarListagem>;

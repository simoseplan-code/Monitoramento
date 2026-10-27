import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FILTROS,
  estadoDeGravado,
  estadoPadrao,
  filtrar,
  lerIds,
  quantitativos,
  tabelaPorAno,
  valoresDosFiltros,
  type EstadoFiltros,
  type ObraConcluida,
} from "@/lib/analiseConcluidas";

const COLUNAS =
  "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, tipo_outros_documentos, acao_conveniada, percentual_execucao, data_receb_definitivo, data_receb_provisorio, valor_original, valor_total";

type Linha = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipo_outros_documentos: string | null;
  acao_conveniada: string | null;
  percentual_execucao: number | string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Todas as obras com recebimento (definitivo ou provisório), lidas em páginas. */
export async function carregarObrasConcluidas(supabase: SupabaseClient): Promise<{ obras: ObraConcluida[]; erro: string | null }> {
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("obras")
      .select(COLUNAS)
      .or("data_receb_definitivo.not.is.null,data_receb_provisorio.not.is.null")
      .order("id_acao")
      .range(de, de + 999);
    if (error) return { obras: [], erro: error.message };
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return { obras: linhas.map(paraObra), erro: null };
}

const paraObra = (l: Linha): ObraConcluida => ({
  id: l.id_acao,
  nome: l.nome_acao ?? "",
  orgao: l.orgao,
  status: l.status,
  estagio: l.estagio_atual,
  tipologia: l.tipologia,
  classificacao: l.classificacao,
  tipoOutros: l.tipo_outros_documentos,
  conveniada: l.acao_conveniada,
  pct: numero(l.percentual_execucao),
  recDef: l.data_receb_definitivo,
  recProv: l.data_receb_provisorio,
  original: numero(l.valor_original),
  total: numero(l.valor_total),
});

/** Obras pelos IDs informados, com ou sem recebimento (para a conferência). */
export async function carregarObrasPorIds(supabase: SupabaseClient, ids: string[]): Promise<{ obras: ObraConcluida[]; erro: string | null }> {
  const linhas: Linha[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("obras").select(COLUNAS).in("id_acao", ids.slice(i, i + 200));
    if (error) return { obras: [], erro: error.message };
    linhas.push(...((data ?? []) as Linha[]));
  }
  return { obras: linhas.map(paraObra), erro: null };
}

/** Frases que dizem o que está filtrado (para o cabeçalho dos relatórios). */
export function descreverFiltros(estado: EstadoFiltros, valores: Record<string, { valor: string; qtd: number }[]>): string[] {
  const frases: string[] = [];
  for (const f of FILTROS) {
    const sel = estado.selecao[f.chave];
    if (!sel) continue;
    const total = valores[f.chave]?.length ?? 0;
    const marcados = Array.from(sel);
    if (marcados.length === 0) frases.push(`${f.rotulo}: nenhum valor marcado`);
    else if (marcados.length <= 6) frases.push(`${f.rotulo}: ${marcados.join(", ")}`);
    else frases.push(`${f.rotulo}: ${marcados.length} de ${total} valores marcados`);
  }
  if (estado.pctMinimo != null) frases.push(`% de execução da ação: maior ou igual a ${estado.pctMinimo}%`);
  if (estado.busca.trim()) frases.push(`Busca por ID ou nome: "${estado.busca.trim()}"`);
  const ids = lerIds(estado.ids);
  if (ids.length > 0) frases.push(`IDs informados: ${ids.length}`);
  frases.push("Ano: recebimento provisório; se não houver, o definitivo");
  return frases;
}

/** Aplica o filtro enviado pela tela e devolve tudo que os relatórios precisam. */
export function montarRelatorio(obras: ObraConcluida[], estadoEnviado: unknown) {
  const valores = valoresDosFiltros(obras);
  const padrao = estadoPadrao(obras);
  const estado = estadoEnviado ? estadoDeGravado(estadoEnviado, padrao, valores) : padrao;
  const filtradas = filtrar(obras, estado);
  return {
    totalNaBase: obras.length,
    filtradas,
    tabela: tabelaPorAno(filtradas),
    q: quantitativos(filtradas),
    filtros: descreverFiltros(estado, valores),
  };
}

export type RelatorioMontado = ReturnType<typeof montarRelatorio>;

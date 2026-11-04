// Análise por território: cálculos puros (sem tela e sem banco).
//
// Regras:
//  - Cada ação entra no território em que cai a MAIOR parte do traçado (território principal). Sem traçado, vale o município
//    que veio do SIMO. Sem nenhum dos dois, fica em "(sem localização)".
//  - A ação "passa" por TODO território em que cai qualquer parte do traçado (mesmo pequena); passa por mais de um = "cruza territórios".
//  - Ano de recebimento: provisório; se não houver, definitivo (igual à Análise de obras concluídas).
//  - Vinculada = tem número de SIAFE automático.

import { PARTICIPACAO_MINIMA, SEM_TERRITORIO, rotuloTerritorio, type ParteDoTerritorio } from "@/lib/territorios";

export const VAZIO = "(vazio)";

export type AcaoT = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipoOutros: string | null;
  conveniada: string | null;
  pct: number | null;
  numeroAutomatico: string | null;
  numeroSiafe: string | null;
  criadaEm: string | null;
  recDef: string | null;
  recProv: string | null;
  original: number | null;
  total: number | null;
  /** Territórios em que a ação cai, do maior para o menor. */
  partes: ParteDoTerritorio[];
  origem: "tracado" | "municipio" | "nenhuma";
  extensaoM: number;
};

const ou = (v: string | null | undefined) => (v && v.trim() !== "" && v.trim() !== "-" ? v.trim() : VAZIO);

export const principal = (a: AcaoT): string => a.partes[0]?.nome ?? SEM_TERRITORIO;
export const passaPor = (a: AcaoT): string[] => {
  const lista = a.partes.filter((p) => p.pct > PARTICIPACAO_MINIMA).map((p) => p.nome);
  return lista.length ? lista : a.partes[0] ? [a.partes[0].nome] : [SEM_TERRITORIO];
};
export const cruza = (a: AcaoT): boolean => passaPor(a).length > 1;

export const dataDeRecebimento = (a: AcaoT) => a.recProv || a.recDef || null;
export const anoDeRecebimento = (a: AcaoT) => (dataDeRecebimento(a) ?? "").slice(0, 4) || VAZIO;
export const anoDeCriacao = (a: AcaoT) => (a.criadaEm ?? "").slice(0, 4) || VAZIO;
export const vinculada = (a: AcaoT) => !!a.numeroAutomatico;
export const valorFinal = (a: AcaoT) => a.total ?? a.original ?? 0;
export const aditivada = (a: AcaoT) => a.original != null && valorFinal(a) - a.original > 0.005;
export const suprimida = (a: AcaoT) => a.original != null && valorFinal(a) - a.original < -0.005;

export function descricaoDosTerritorios(a: AcaoT): string {
  if (a.partes.length === 0) return "-";
  return a.partes.map((p) => `${rotuloTerritorio(p.nome)} ${Math.round(p.pct * 100)}%`).join(" · ");
}

// ---------- filtros (lista de valores para marcar, como no Excel) ----------

export type DefinicaoFiltro = { chave: string; rotulo: string; valores: (a: AcaoT) => string[] };
const um = (f: (a: AcaoT) => string) => (a: AcaoT) => [f(a)];

export const FILTROS: DefinicaoFiltro[] = [
  { chave: "territorio", rotulo: "Território (principal)", valores: um((a) => rotuloTerritorio(principal(a))) },
  { chave: "passa", rotulo: "Passa pelo território", valores: (a) => passaPor(a).map(rotuloTerritorio) },
  { chave: "cruza", rotulo: "Cruza territórios", valores: um((a) => (cruza(a) ? "Sim, mais de um" : "Não")) },
  { chave: "origem", rotulo: "Localizada por", valores: um((a) => (a.origem === "tracado" ? "Traçado (KML/mapa)" : a.origem === "municipio" ? "Município do SIMO" : "Sem localização")) },
  { chave: "vinculacao", rotulo: "Vinculação SIAFE", valores: um((a) => (vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número")) },
  { chave: "classificacao", rotulo: "Classificação", valores: um((a) => ou(a.classificacao)) },
  { chave: "ano", rotulo: "Ano de recebimento", valores: um(anoDeRecebimento) },
  { chave: "anoCriacao", rotulo: "Ano de criação", valores: um(anoDeCriacao) },
  { chave: "status", rotulo: "Status", valores: um((a) => ou(a.status)) },
  { chave: "orgao", rotulo: "Órgão", valores: um((a) => ou(a.orgao)) },
  { chave: "estagio", rotulo: "Estágio atual", valores: um((a) => ou(a.estagio)) },
  { chave: "tipologia", rotulo: "Tipologia", valores: um((a) => ou(a.tipologia)) },
  { chave: "tipoOutros", rotulo: "Tipo de outros documentos", valores: um((a) => ou(a.tipoOutros)) },
  { chave: "conveniada", rotulo: "Ação conveniada", valores: um((a) => ou(a.conveniada)) },
  { chave: "aditivo", rotulo: "Aditivo", valores: um((a) => (a.original == null ? "Sem valor informado" : aditivada(a) ? "Com aditivo" : suprimida(a) ? "Com supressão" : "Sem aditivo")) },
  { chave: "id", rotulo: "ID", valores: um((a) => a.id) },
];

export type Selecao = Record<string, Set<string> | null>; // null = tudo marcado

export type EstadoFiltros = {
  selecao: Selecao;
  /** Percentual mínimo de execução, em % (80 = 80%). null = sem corte. */
  pctMinimo: number | null;
  busca: string;
  /** IDs para ver só eles (separados por espaço, vírgula ou quebra de linha). Vazio = todos. */
  ids: string;
};

export function estadoPadrao(): EstadoFiltros {
  const selecao: Selecao = {};
  for (const f of FILTROS) selecao[f.chave] = null;
  return { selecao, pctMinimo: null, busca: "", ids: "" };
}

export function lerIds(texto: string): string[] {
  return Array.from(new Set(texto.split(/[^0-9]+/).filter((s) => s.length >= 1 && s.length <= 12)));
}

export function valoresDosFiltros(acoes: AcaoT[]): Record<string, { valor: string; qtd: number }[]> {
  const saida: Record<string, { valor: string; qtd: number }[]> = {};
  for (const f of FILTROS) {
    const mapa = new Map<string, number>();
    for (const a of acoes) for (const v of f.valores(a)) mapa.set(v, (mapa.get(v) ?? 0) + 1);
    saida[f.chave] = Array.from(mapa, ([valor, qtd]) => ({ valor, qtd })).sort((x, y) =>
      f.chave === "id" ? Number(x.valor) - Number(y.valor) : f.chave === "ano" || f.chave === "anoCriacao" ? x.valor.localeCompare(y.valor) : y.qtd - x.qtd || x.valor.localeCompare(y.valor)
    );
  }
  return saida;
}

export function filtrar(acoes: AcaoT[], estado: EstadoFiltros): AcaoT[] {
  const busca = estado.busca.trim().toLowerCase();
  const idsPedidos = new Set(lerIds(estado.ids));
  const minimo = estado.pctMinimo == null ? null : estado.pctMinimo / 100;
  return acoes.filter((a) => {
    if (minimo != null && (a.pct == null || a.pct < minimo - 1e-9)) return false;
    if (idsPedidos.size > 0 && !idsPedidos.has(a.id)) return false;
    if (busca && !(a.id.toLowerCase().includes(busca) || a.nome.toLowerCase().includes(busca) || (a.orgao ?? "").toLowerCase().includes(busca))) return false;
    for (const f of FILTROS) {
      const sel = estado.selecao[f.chave];
      if (sel && !f.valores(a).some((v) => sel.has(v))) return false;
    }
    return true;
  });
}

// ---------- resumo por território ----------

export type LinhaTerritorio = {
  territorio: string;
  acoes: number;
  vinculadas: number;
  naoVinculadas: number;
  comRecebimento: number;
  aditivadas: number;
  original: number;
  total: number;
  /** Ações de outro território principal que também passam por este. */
  tambemPassam: number;
  /** Quilômetros de traçado dentro do território (soma de todas as ações que passam por ele). */
  km: number;
  comTracado: number;
};

const linhaVazia = (territorio: string): LinhaTerritorio => ({ territorio, acoes: 0, vinculadas: 0, naoVinculadas: 0, comRecebimento: 0, aditivadas: 0, original: 0, total: 0, tambemPassam: 0, km: 0, comTracado: 0 });

export function resumoPorTerritorio(acoes: AcaoT[], todos: string[]): { linhas: LinhaTerritorio[]; geral: LinhaTerritorio } {
  const mapa = new Map<string, LinhaTerritorio>();
  for (const t of todos) mapa.set(t, linhaVazia(t));
  mapa.set(SEM_TERRITORIO, linhaVazia(SEM_TERRITORIO));
  const geral = linhaVazia("Total");
  for (const a of acoes) {
    const p = principal(a);
    const l = mapa.get(p) ?? linhaVazia(p);
    mapa.set(p, l);
    for (const x of [l, geral]) {
      x.acoes++;
      if (vinculada(a)) x.vinculadas++;
      else x.naoVinculadas++;
      if (dataDeRecebimento(a)) x.comRecebimento++;
      if (aditivada(a)) x.aditivadas++;
      x.original += a.original ?? 0;
      x.total += valorFinal(a);
      if (a.origem === "tracado") x.comTracado++;
    }
    for (const parte of a.partes) {
      const alvo = mapa.get(parte.nome);
      if (!alvo) continue;
      alvo.km += parte.metros / 1000;
      geral.km += parte.metros / 1000;
      if (parte.nome !== p && parte.pct > PARTICIPACAO_MINIMA) alvo.tambemPassam++;
    }
  }
  const linhas = Array.from(mapa.values()).sort((a, b) => (a.territorio === SEM_TERRITORIO ? 1 : b.territorio === SEM_TERRITORIO ? -1 : b.acoes - a.acoes || a.territorio.localeCompare(b.territorio, "pt-BR")));
  return { linhas, geral };
}

// ---------- filtro gravado (vai e volta do banco como JSON) ----------

export type EstadoGravado = { selecao: Record<string, string[] | null>; pctMinimo: number | null; busca: string; ids: string };

export function estadoParaGravar(e: EstadoFiltros): EstadoGravado {
  const selecao: EstadoGravado["selecao"] = {};
  for (const f of FILTROS) {
    const s = e.selecao[f.chave];
    selecao[f.chave] = s ? Array.from(s) : null;
  }
  return { selecao, pctMinimo: e.pctMinimo, busca: e.busca, ids: e.ids };
}

/** Volta o filtro gravado para o estado da tela. Valores que não existem mais são ignorados. */
export function estadoDeGravado(g: unknown, valores: Record<string, { valor: string; qtd: number }[]>): EstadoFiltros {
  const padrao = estadoPadrao();
  if (!g || typeof g !== "object") return padrao;
  const x = g as Partial<EstadoGravado>;
  const selecao: Selecao = {};
  for (const f of FILTROS) {
    const gravada = x.selecao?.[f.chave];
    if (gravada === undefined || gravada === null || !Array.isArray(gravada)) selecao[f.chave] = null;
    else {
      const existentes = new Set((valores[f.chave] ?? []).map((v) => v.valor));
      selecao[f.chave] = new Set(gravada.filter((v) => typeof v === "string" && existentes.has(v)));
    }
  }
  return { selecao, pctMinimo: typeof x.pctMinimo === "number" ? x.pctMinimo : null, busca: typeof x.busca === "string" ? x.busca : "", ids: typeof x.ids === "string" ? x.ids : "" };
}

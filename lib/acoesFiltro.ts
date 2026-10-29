// Tela "Ações": cálculos puros dos filtros (sem tela e sem banco), usados pela tela e pelo PDF.
//
// Vinculação (mesma regra de sempre):
//  - Vinculada: tem número automático.
//  - Pendente: sem número automático, mas com número SIAFE.
//  - Sem número: sem número automático e sem número SIAFE.
// "Não vinculada" = Pendente + Sem número.

export const VAZIO = "(vazio)";

export type AcaoLinha = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  conveniada: string | null;
  /** Percentual de execução em fração (1 = 100%). */
  pct: number | null;
  numeroAutomatico: string | null;
  numeroSiafe: string | null;
  criadaEm: string | null;
  recDef: string | null;
  recProv: string | null;
};

export type Vinculacao = "Vinculada" | "Pendente" | "Sem número";

export function vinculacao(a: AcaoLinha): Vinculacao {
  if (a.numeroAutomatico) return "Vinculada";
  if (a.numeroSiafe) return "Pendente";
  return "Sem número";
}

/** Ano do recebimento: o provisório; se não houver, o definitivo (mesma regra da análise de obras concluídas). */
export function anoDeRecebimento(a: AcaoLinha): string {
  const d = a.recProv || a.recDef;
  return d ? d.slice(0, 4) : VAZIO;
}

/** Data (AAAA-MM-DD...) em dd/mm/aaaa; "-" quando não há. */
export function dataBR(d: string | null): string {
  if (!d) return "-";
  const p = d.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export const siafeValido = (n: string | null) => !!n && /^\d{8}$/.test(n.trim());

const ou = (v: string | null | undefined) => (v && v.trim() !== "" && v.trim() !== "-" ? v.trim() : VAZIO);

export type DefinicaoFiltro = { chave: string; rotulo: string; valor: (a: AcaoLinha) => string };

export const FILTROS: DefinicaoFiltro[] = [
  { chave: "vinculacao", rotulo: "Vinculação", valor: vinculacao },
  { chave: "ano", rotulo: "Ano de recebimento", valor: anoDeRecebimento },
  { chave: "status", rotulo: "Status", valor: (a) => ou(a.status) },
  { chave: "orgao", rotulo: "Órgão", valor: (a) => ou(a.orgao) },
  { chave: "estagio", rotulo: "Estágio atual", valor: (a) => ou(a.estagio) },
  { chave: "tipologia", rotulo: "Tipologia", valor: (a) => ou(a.tipologia) },
  { chave: "classificacao", rotulo: "Classificação", valor: (a) => ou(a.classificacao) },
  { chave: "conveniada", rotulo: "Ação conveniada", valor: (a) => ou(a.conveniada) },
  { chave: "siafe", rotulo: "Nº SIAFE", valor: (a) => (!a.numeroSiafe ? "Sem número SIAFE" : siafeValido(a.numeroSiafe) ? "Número válido" : "Dado incorreto") },
  { chave: "id", rotulo: "ID", valor: (a) => a.id },
];

export type Selecao = Record<string, Set<string> | null>; // null = tudo marcado

export type EstadoFiltros = {
  selecao: Selecao;
  /** Percentual mínimo de execução, em % (80 = 80%). null = sem corte. */
  pctMinimo: number | null;
  busca: string;
  /** Datas de criação (AAAA-MM-DD), vazias = sem corte. */
  de: string;
  ate: string;
  /** IDs para tirar da análise (separados por espaço, vírgula ou quebra de linha). */
  excluir: string;
};

export function estadoPadrao(): EstadoFiltros {
  const selecao: Selecao = {};
  for (const f of FILTROS) selecao[f.chave] = null;
  return { selecao, pctMinimo: null, busca: "", de: "", ate: "", excluir: "" };
}

/** Valores distintos de cada filtro, com a quantidade de ações. */
export function valoresDosFiltros(acoes: AcaoLinha[]): Record<string, { valor: string; qtd: number }[]> {
  const saida: Record<string, { valor: string; qtd: number }[]> = {};
  for (const f of FILTROS) {
    const mapa = new Map<string, number>();
    for (const a of acoes) {
      const v = f.valor(a);
      mapa.set(v, (mapa.get(v) ?? 0) + 1);
    }
    saida[f.chave] = Array.from(mapa, ([valor, qtd]) => ({ valor, qtd })).sort((x, y) =>
      f.chave === "id" ? Number(x.valor) - Number(y.valor) : f.chave === "ano" ? x.valor.localeCompare(y.valor) : y.qtd - x.qtd || x.valor.localeCompare(y.valor)
    );
  }
  return saida;
}

export function filtrar(acoes: AcaoLinha[], estado: EstadoFiltros): AcaoLinha[] {
  const busca = estado.busca.trim().toLowerCase();
  const excluidos = new Set(lerIds(estado.excluir ?? ""));
  const minimo = estado.pctMinimo == null ? null : estado.pctMinimo / 100;
  return acoes.filter((a) => {
    if (excluidos.size > 0 && excluidos.has(a.id)) return false;
    if (minimo != null && (a.pct == null || a.pct < minimo - 1e-9)) return false;
    if (estado.de && (!a.criadaEm || a.criadaEm.slice(0, 10) < estado.de)) return false;
    if (estado.ate && (!a.criadaEm || a.criadaEm.slice(0, 10) > estado.ate)) return false;
    if (busca && !(a.id.toLowerCase().includes(busca) || a.nome.toLowerCase().includes(busca) || (a.orgao ?? "").toLowerCase().includes(busca))) return false;
    for (const f of FILTROS) {
      const sel = estado.selecao[f.chave];
      if (sel && !sel.has(f.valor(a))) return false;
    }
    return true;
  });
}

/** IDs digitados ou colados (planilha, e-mail...): só os números, sem repetir. */
export function lerIds(texto: string): string[] {
  return Array.from(new Set(texto.split(/[^0-9]+/).filter((s) => s.length >= 1 && s.length <= 12)));
}

// ---------- filtro gravado (vai e volta do banco / da tela como JSON) ----------

export type EstadoGravado = {
  selecao: Record<string, string[] | null>;
  pctMinimo: number | null;
  busca: string;
  de: string;
  ate: string;
  excluir?: string;
};

export function estadoParaGravar(e: EstadoFiltros): EstadoGravado {
  const selecao: EstadoGravado["selecao"] = {};
  for (const f of FILTROS) {
    const s = e.selecao[f.chave];
    selecao[f.chave] = s ? Array.from(s) : null;
  }
  return { selecao, pctMinimo: e.pctMinimo, busca: e.busca, de: e.de, ate: e.ate, excluir: e.excluir };
}

/** Volta o estado gravado para o da tela. Valores que não existem mais são ignorados. */
export function estadoDeGravado(g: unknown, valores: Record<string, { valor: string; qtd: number }[]>): EstadoFiltros {
  const padrao = estadoPadrao();
  if (!g || typeof g !== "object") return padrao;
  const x = g as Partial<EstadoGravado>;
  const selecao: Selecao = {};
  for (const f of FILTROS) {
    const gravada = x.selecao?.[f.chave];
    if (gravada === undefined || gravada === null || !Array.isArray(gravada)) {
      selecao[f.chave] = null;
    } else {
      const existentes = new Set((valores[f.chave] ?? []).map((v) => v.valor));
      selecao[f.chave] = new Set(gravada.filter((v) => typeof v === "string" && existentes.has(v)));
    }
  }
  return {
    selecao,
    pctMinimo: typeof x.pctMinimo === "number" ? x.pctMinimo : null,
    busca: typeof x.busca === "string" ? x.busca : "",
    de: typeof x.de === "string" ? x.de : "",
    ate: typeof x.ate === "string" ? x.ate : "",
    excluir: typeof x.excluir === "string" ? x.excluir : "",
  };
}

/** Frases que dizem o que está filtrado (cabeçalho do PDF). */
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
  if (estado.de) frases.push(`Criada a partir de ${estado.de.split("-").reverse().join("/")}`);
  if (estado.ate) frases.push(`Criada até ${estado.ate.split("-").reverse().join("/")}`);
  const nExcluidos = lerIds(estado.excluir ?? "").length;
  if (nExcluidos > 0) frases.push(`${nExcluidos} ID(s) desconsiderado(s) da análise`);
  if (estado.busca.trim()) frases.push(`Busca por ID, nome ou órgão: "${estado.busca.trim()}"`);
  if (frases.length === 0) frases.push("Nenhum filtro: todas as ações");
  return frases;
}

export function contagemVinculacao(acoes: AcaoLinha[]) {
  let vinculadas = 0;
  let pendentes = 0;
  let semNumero = 0;
  for (const a of acoes) {
    const v = vinculacao(a);
    if (v === "Vinculada") vinculadas++;
    else if (v === "Pendente") pendentes++;
    else semNumero++;
  }
  return { vinculadas, pendentes, semNumero, naoVinculadas: pendentes + semNumero };
}

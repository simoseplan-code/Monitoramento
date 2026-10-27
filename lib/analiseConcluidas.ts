// Análise de obras concluídas: cálculos puros (sem tela e sem banco), usados pela tela de filtros.
//
// Regras:
//  - Ano de recebimento: usa o recebimento DEFINITIVO; se não houver, o PROVISÓRIO. "-" é o mesmo
//    que vazio. Sem nenhuma das duas datas, a obra nem entra na análise.
//  - Valor original = valor contratado. Valor total = valor ao final da obra (com aditivos). Se o
//    valor total não veio, considera o original (obra sem aditivo).
//  - Aditivo = valor total menos valor original. A obra é "aditivada" quando a diferença é maior que zero.
//  - Obras com "tipo de outros documentos" preenchido ficam de fora por padrão, mas aparecem no filtro.

export const VAZIO = "(vazio)";

export type ObraConcluida = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipoOutros: string | null;
  conveniada: string | null;
  /** Percentual de execução em fração (1 = 100%). */
  pct: number | null;
  recDef: string | null;
  recProv: string | null;
  original: number | null;
  total: number | null;
};

export function dataDeRecebimento(o: ObraConcluida): string | null {
  return o.recDef || o.recProv || null;
}

export function anoDeRecebimento(o: ObraConcluida): string {
  const d = dataDeRecebimento(o);
  return d ? d.slice(0, 4) : VAZIO;
}

export function tipoDeRecebimento(o: ObraConcluida): string {
  return o.recDef ? "Definitivo" : o.recProv ? "Provisório" : VAZIO;
}

/** Valor ao final da obra: o valor total, ou o original quando não há aditivo informado. */
export function valorFinal(o: ObraConcluida): number {
  return o.total ?? o.original ?? 0;
}

export function valorAditivo(o: ObraConcluida): number {
  return valorFinal(o) - (o.original ?? 0);
}

export function aditivada(o: ObraConcluida): boolean {
  return o.original != null && valorAditivo(o) > 0.005;
}

export function suprimida(o: ObraConcluida): boolean {
  return o.original != null && valorAditivo(o) < -0.005;
}

// ---------- filtros (como no Excel: lista de valores para marcar e desmarcar) ----------

export type DefinicaoFiltro = { chave: string; rotulo: string; valor: (o: ObraConcluida) => string };

const ou = (v: string | null | undefined) => (v && v.trim() !== "" && v.trim() !== "-" ? v.trim() : VAZIO);

export const FILTROS: DefinicaoFiltro[] = [
  { chave: "classificacao", rotulo: "Classificação", valor: (o) => ou(o.classificacao) },
  { chave: "ano", rotulo: "Ano de recebimento", valor: anoDeRecebimento },
  { chave: "tipoRec", rotulo: "Tipo de recebimento", valor: tipoDeRecebimento },
  { chave: "status", rotulo: "Status", valor: (o) => ou(o.status) },
  { chave: "orgao", rotulo: "Órgão", valor: (o) => ou(o.orgao) },
  { chave: "estagio", rotulo: "Estágio atual", valor: (o) => ou(o.estagio) },
  { chave: "tipologia", rotulo: "Tipologia", valor: (o) => ou(o.tipologia) },
  { chave: "tipoOutros", rotulo: "Tipo de outros documentos", valor: (o) => ou(o.tipoOutros) },
  { chave: "conveniada", rotulo: "Ação conveniada", valor: (o) => ou(o.conveniada) },
  { chave: "aditivo", rotulo: "Aditivo", valor: (o) => (o.original == null ? "Sem valor informado" : aditivada(o) ? "Com aditivo" : suprimida(o) ? "Com supressão" : "Sem aditivo") },
];

export type Selecao = Record<string, Set<string> | null>; // null = tudo marcado

export type EstadoFiltros = {
  selecao: Selecao;
  /** Percentual mínimo de execução, em % (80 = 80%). null = sem corte. */
  pctMinimo: number | null;
  busca: string;
};

export const PCT_MINIMO_PADRAO = 80;

/** Valores distintos de cada filtro, com a quantidade de obras (ordenados por quantidade). */
export function valoresDosFiltros(obras: ObraConcluida[]): Record<string, { valor: string; qtd: number }[]> {
  const saida: Record<string, { valor: string; qtd: number }[]> = {};
  for (const f of FILTROS) {
    const mapa = new Map<string, number>();
    for (const o of obras) {
      const v = f.valor(o);
      mapa.set(v, (mapa.get(v) ?? 0) + 1);
    }
    saida[f.chave] = Array.from(mapa, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => (f.chave === "ano" ? a.valor.localeCompare(b.valor) : b.qtd - a.qtd || a.valor.localeCompare(b.valor)));
  }
  return saida;
}

/** Filtros que já vêm marcados: classificação OBRA, sem "tipo de outros documentos" e execução de 80% ou mais. */
export function estadoPadrao(obras: ObraConcluida[]): EstadoFiltros {
  const selecao: Selecao = {};
  for (const f of FILTROS) selecao[f.chave] = null;
  if (obras.some((o) => ou(o.classificacao) === "OBRA")) selecao.classificacao = new Set(["OBRA"]);
  selecao.tipoOutros = new Set([VAZIO]);
  return { selecao, pctMinimo: PCT_MINIMO_PADRAO, busca: "" };
}

export function filtrar(obras: ObraConcluida[], estado: EstadoFiltros): ObraConcluida[] {
  const busca = estado.busca.trim().toLowerCase();
  const minimo = estado.pctMinimo == null ? null : estado.pctMinimo / 100;
  return obras.filter((o) => {
    if (minimo != null && (o.pct == null || o.pct < minimo - 1e-9)) return false;
    if (busca && !(o.id.toLowerCase().includes(busca) || o.nome.toLowerCase().includes(busca))) return false;
    for (const f of FILTROS) {
      const sel = estado.selecao[f.chave];
      if (sel && !sel.has(f.valor(o))) return false;
    }
    return true;
  });
}

// ---------- tabela por ano e quantitativos ----------

export type LinhaAno = {
  ano: string;
  original: number;
  qtd: number;
  aditivadas: number;
  total: number;
  /** Aditivadas / analisadas (0 a 1). */
  pctQuant: number;
  /** Valor aditivado / valor contratado (0 a 1). */
  pctValor: number;
  aditivo: number;
};

function linhaDe(ano: string, obras: ObraConcluida[]): LinhaAno {
  const original = obras.reduce((s, o) => s + (o.original ?? 0), 0);
  const total = obras.reduce((s, o) => s + valorFinal(o), 0);
  const aditivadas = obras.filter(aditivada).length;
  return {
    ano,
    original,
    qtd: obras.length,
    aditivadas,
    total,
    pctQuant: obras.length ? aditivadas / obras.length : 0,
    pctValor: original ? (total - original) / original : 0,
    aditivo: total - original,
  };
}

export function tabelaPorAno(obras: ObraConcluida[]): { linhas: LinhaAno[]; geral: LinhaAno } {
  const porAno = new Map<string, ObraConcluida[]>();
  for (const o of obras) {
    const a = anoDeRecebimento(o);
    const lista = porAno.get(a);
    if (lista) lista.push(o);
    else porAno.set(a, [o]);
  }
  const linhas = Array.from(porAno, ([ano, lista]) => linhaDe(ano, lista)).sort((a, b) => a.ano.localeCompare(b.ano));
  return { linhas, geral: linhaDe("Total geral", obras) };
}

export type Quantitativos = {
  obras: number;
  comValor: number;
  semValor: number;
  definitivo: number;
  soProvisorio: number;
  aditivadas: number;
  suprimidas: number;
  semAditivo: number;
  maiorAditivo: { id: string; nome: string; valor: number } | null;
  ticketMedio: number;
  aditivoMedioPorAditivada: number;
  porOrgao: { orgao: string; qtd: number; original: number; aditivo: number; aditivadas: number }[];
};

export function quantitativos(obras: ObraConcluida[]): Quantitativos {
  let maior: Quantitativos["maiorAditivo"] = null;
  let somaAditivosPositivos = 0;
  const orgaos = new Map<string, { orgao: string; qtd: number; original: number; aditivo: number; aditivadas: number }>();
  for (const o of obras) {
    const ad = valorAditivo(o);
    if (aditivada(o)) {
      somaAditivosPositivos += ad;
      if (!maior || ad > maior.valor) maior = { id: o.id, nome: o.nome, valor: ad };
    }
    const nome = ou(o.orgao);
    const x = orgaos.get(nome) ?? { orgao: nome, qtd: 0, original: 0, aditivo: 0, aditivadas: 0 };
    x.qtd++;
    x.original += o.original ?? 0;
    x.aditivo += ad;
    if (aditivada(o)) x.aditivadas++;
    orgaos.set(nome, x);
  }
  const comValor = obras.filter((o) => o.original != null).length;
  const adit = obras.filter(aditivada).length;
  const original = obras.reduce((s, o) => s + (o.original ?? 0), 0);
  return {
    obras: obras.length,
    comValor,
    semValor: obras.length - comValor,
    definitivo: obras.filter((o) => !!o.recDef).length,
    soProvisorio: obras.filter((o) => !o.recDef && !!o.recProv).length,
    aditivadas: adit,
    suprimidas: obras.filter(suprimida).length,
    semAditivo: obras.filter((o) => o.original != null && !aditivada(o) && !suprimida(o)).length,
    maiorAditivo: maior,
    ticketMedio: comValor ? original / comValor : 0,
    aditivoMedioPorAditivada: adit ? somaAditivosPositivos / adit : 0,
    porOrgao: Array.from(orgaos.values()).sort((a, b) => b.qtd - a.qtd || b.original - a.original),
  };
}

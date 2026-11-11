// Análise de custos (tela só para admin e chefe): custo unitário (R$ por m², por km, por unidade...) das obras,
// comparado entre ações da mesma tipologia e unidade. Lógica pura.
//
// Por que assim: o custo por m² muda muito com o tipo de pavimento (paralelepípedo, bloco intertravado, asfalto, tratamento
// superficial...) e com o mês da tabela de preços. Não há um valor de referência único e consolidado, então o painel compara
// as próprias obras entre si, com estatística que resiste a erros de digitação (mediana e quartis) e deixa a pessoa separar
// por tipo de pavimento, órgão e ano, e corrigir os valores por uma taxa anual.

export type ObraCusto = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  classificacao: string | null;
  tipologia: string | null;
  /** Unidade normalizada (M², KM, M, UNIDADE...). */
  unidade: string;
  quantidade: number;
  contratado: number | null;
  final: number | null;
  pago: number | null;
  anoReceb: string | null;
  anoCriacao: string | null;
  revestimento: string;
  servico: string;
  /** A auditoria desconfia da quantidade/unidade desta ação (e ninguém marcou como certa). */
  suspeita: boolean;
  /** Por que a auditoria desconfia (título e detalhe de cada problema). */
  motivos: string[];
};

// ---------- tipo de pavimento e de serviço, lidos do nome da ação ----------

const REVESTIMENTOS: { re: RegExp; nome: string }[] = [
  { re: /paralelep[ií]pedo/i, nome: "Paralelepípedo" },
  { re: /intertravad|bloquete|sextavad|paver|bloco de concreto/i, nome: "Bloco intertravado" },
  { re: /pedra (tosca|irregular|poli[eé]drica)|poli[eé]drico/i, nome: "Pedra tosca/poliédrica" },
  { re: /cbuq|asf[aá]lt|concreto betuminoso|usinado|\bcap\b|\bpmf\b|tapa[- ]?buraco|recapeamento/i, nome: "Asfalto (CBUQ/CAP)" },
  { re: /tratamento superficial|\btsd\b|\btss\b|\btst\b/i, nome: "Tratamento superficial" },
  { re: /concreto (r[ií]gido|cimento)|pavimento r[ií]gido|placas? de concreto/i, nome: "Concreto rígido" },
  { re: /cascalh|piçarr|pi[cç]arra|revestimento prim[aá]rio|encascalh|saibro/i, nome: "Revestimento primário (cascalho)" },
];

export function revestimentoDoNome(nome: string): string {
  for (const r of REVESTIMENTOS) if (r.re.test(nome)) return r.nome;
  return "Não informado";
}

const SERVICOS: { re: RegExp; nome: string }[] = [
  { re: /recupera[cç][aã]o|restaura[cç][aã]o|reabilita|manuten[cç][aã]o|conserva|recapeamento|reforma|revitaliza|tapa[- ]?buraco/i, nome: "Recuperação/manutenção" },
  { re: /constru[cç][aã]o|implanta[cç][aã]o|pavimenta[cç][aã]o|execu[cç][aã]o|abertura/i, nome: "Construção/pavimentação" },
];

export function servicoDoNome(nome: string): string {
  for (const s of SERVICOS) if (s.re.test(nome)) return s.nome;
  return "Não informado";
}

// ---------- estatística ----------

/** Quantil por interpolação linear (q de 0 a 1) em lista já ordenada. */
export function quantil(ordenado: number[], q: number): number | null {
  if (ordenado.length === 0) return null;
  const pos = (ordenado.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  return ordenado[base + 1] !== undefined ? ordenado[base] + resto * (ordenado[base + 1] - ordenado[base]) : ordenado[base];
}

export type Estat = { n: number; mediana: number | null; p25: number | null; p75: number | null; min: number | null; max: number | null; media: number | null };

export function estatistica(valores: number[]): Estat {
  const o = [...valores].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return {
    n: o.length,
    mediana: quantil(o, 0.5),
    p25: quantil(o, 0.25),
    p75: quantil(o, 0.75),
    min: o[0] ?? null,
    max: o[o.length - 1] ?? null,
    media: o.length ? o.reduce((s, v) => s + v, 0) / o.length : null,
  };
}

export type Opcoes = {
  base: "final" | "contratado";
  /** Correção anual em % (0 = valores como estão). Corrige do ano de recebimento (ou de criação) até o ano de hoje. */
  correcaoAnual: number;
  anoHoje: number;
};

export function valorDaObra(o: ObraCusto, op: Opcoes): number | null {
  const v = op.base === "final" ? (o.final ?? o.contratado) : (o.contratado ?? o.final);
  if (v == null || v <= 0) return null;
  const ano = Number(o.anoReceb ?? o.anoCriacao);
  if (!op.correcaoAnual || !Number.isFinite(ano) || ano >= op.anoHoje) return v;
  return v * Math.pow(1 + op.correcaoAnual / 100, op.anoHoje - ano);
}

/** Custo por unidade (R$ por m², km, unidade...). null se faltar valor ou quantidade. */
export function custoUnitario(o: ObraCusto, op: Opcoes): number | null {
  const v = valorDaObra(o, op);
  return v != null && o.quantidade > 0 ? v / o.quantidade : null;
}

export type Grupo = {
  chave: string;
  tipologia: string;
  unidade: string;
  acoes: number;
  valor: number;
  quantidade: number;
  /** Σ valor ÷ Σ quantidade: o custo "do conjunto" (obras grandes pesam mais). */
  ponderado: number | null;
  est: Estat;
};

export function agrupar(obras: ObraCusto[], op: Opcoes): Grupo[] {
  const mapa = new Map<string, { tipologia: string; unidade: string; custos: number[]; valor: number; quantidade: number }>();
  for (const o of obras) {
    const c = custoUnitario(o, op);
    const v = valorDaObra(o, op);
    if (c == null || v == null) continue;
    const tip = (o.tipologia ?? "").trim() || "(sem tipologia)";
    const k = `${tip.toUpperCase()}|${o.unidade}`;
    const g = mapa.get(k) ?? { tipologia: tip, unidade: o.unidade, custos: [], valor: 0, quantidade: 0 };
    g.custos.push(c);
    g.valor += v;
    g.quantidade += o.quantidade;
    mapa.set(k, g);
  }
  return Array.from(mapa, ([chave, g]) => ({ chave, tipologia: g.tipologia, unidade: g.unidade, acoes: g.custos.length, valor: g.valor, quantidade: g.quantidade, ponderado: g.quantidade > 0 ? g.valor / g.quantidade : null, est: estatistica(g.custos) })).sort((a, b) => b.valor - a.valor);
}

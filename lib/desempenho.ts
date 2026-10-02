export type LinhaAgregada = {
  dia: string;
  usuario_id: string;
  usuario_nome: string;
  modulo: string;
  acao: string;
  retroativo: boolean;
  total: number;
};

export const MODULOS = [
  { chave: "novas_acoes", nome: "Novas Ações", cor: "var(--series-1)" },
  { chave: "sobreposicoes", nome: "Sobreposições", cor: "var(--series-3)" },
  { chave: "termos", nome: "Termos", cor: "var(--series-4)" },
  { chave: "unidade_quantidade", nome: "Unidade/Quantidade", cor: "var(--series-2)" },
  { chave: "vinculacao", nome: "Vinculação SIAFE", cor: "var(--series-7)" },
] as const;

export const CORES_PESSOAS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-7)",
  "var(--series-8)",
  "var(--series-6)",
];

// Desfazer/reabrir não é produção, e falha de gravação no SIMO não é análise
// concluída — ficam fora do total "produtivo" e aparecem à parte.
const ACOES_IMPRODUTIVAS = new Set(["pendente", "reaberto", "desaprovado"]);
const ACOES_FALHA = new Set(["falha_gravacao", "falha_vinculacao"]);

export type LinhaPessoa = {
  id: string;
  nome: string;
  total: number;
  porModulo: Record<string, number>;
  diasAtivos: number;
  mediaPorDiaAtivo: number;
  ultimoDia: string;
  falhas: number;
};

export type Desempenho = {
  totalProdutivo: number;
  totalFalhas: number;
  totalDesfeitos: number;
  retroativos: number;
  pessoas: number;
  diasAtivos: number;
  mediaPorDiaAtivo: number;
  melhorDia: { dia: string; total: number } | null;
  primeiroDia: string | null;
  ultimoDia: string | null;
  porModulo: { chave: string; nome: string; cor: string; total: number }[];
  porPessoa: LinhaPessoa[];
  serie: Record<string, string | number>[];
  agrupamento: "dia" | "semana";
  serieModulos: Record<string, string | number>[];
  serieSemana: { dia: string; total: number }[];
  topPessoasChaves: { chave: string; nome: string; cor: string }[];
  porDiaSemana: { dia: string; total: number }[];
};

function paraData(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inicioDaSemana(iso: string): string {
  const d = paraData(iso);
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return paraIso(d);
}

function rotulo(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function calcularDesempenho(linhas: LinhaAgregada[]): Desempenho {
  const nomes = new Map<string, string>();
  const porDia = new Map<string, number>();
  const porDiaModulo = new Map<string, Record<string, number>>();
  const porDiaPessoa = new Map<string, Map<string, number>>();
  const pessoas = new Map<string, LinhaPessoa & { dias: Set<string> }>();
  const totalModulo: Record<string, number> = {};
  const diaSemana = [0, 0, 0, 0, 0, 0, 0];

  let totalProdutivo = 0;
  let totalFalhas = 0;
  let totalDesfeitos = 0;
  let retroativos = 0;

  for (const l of linhas) {
    const n = Number(l.total);
    nomes.set(l.usuario_id, l.usuario_nome);

    let p = pessoas.get(l.usuario_id);
    if (!p) {
      p = {
        id: l.usuario_id,
        nome: l.usuario_nome,
        total: 0,
        porModulo: {},
        diasAtivos: 0,
        mediaPorDiaAtivo: 0,
        ultimoDia: l.dia,
        falhas: 0,
        dias: new Set(),
      };
      pessoas.set(l.usuario_id, p);
    }

    if (ACOES_FALHA.has(l.acao)) {
      totalFalhas += n;
      p.falhas += n;
      continue;
    }
    if (ACOES_IMPRODUTIVAS.has(l.acao)) {
      totalDesfeitos += n;
      continue;
    }

    totalProdutivo += n;
    if (l.retroativo) retroativos += n;
    p.total += n;
    p.porModulo[l.modulo] = (p.porModulo[l.modulo] ?? 0) + n;
    p.dias.add(l.dia);
    if (l.dia > p.ultimoDia) p.ultimoDia = l.dia;
    totalModulo[l.modulo] = (totalModulo[l.modulo] ?? 0) + n;

    porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + n);
    const m = porDiaModulo.get(l.dia) ?? {};
    m[l.modulo] = (m[l.modulo] ?? 0) + n;
    porDiaModulo.set(l.dia, m);

    const pp = porDiaPessoa.get(l.dia) ?? new Map<string, number>();
    pp.set(l.usuario_id, (pp.get(l.usuario_id) ?? 0) + n);
    porDiaPessoa.set(l.dia, pp);

    diaSemana[(paraData(l.dia).getUTCDay() + 6) % 7] += n;
  }

  const dias = Array.from(porDia.keys()).sort();
  const primeiroDia = dias[0] ?? null;
  const ultimoDia = dias[dias.length - 1] ?? null;

  let melhorDia: { dia: string; total: number } | null = null;
  for (const [dia, total] of porDia) if (!melhorDia || total > melhorDia.total) melhorDia = { dia, total };

  const porPessoa = Array.from(pessoas.values())
    .filter((p) => p.total > 0 || p.falhas > 0)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      total: p.total,
      porModulo: p.porModulo,
      diasAtivos: p.dias.size,
      mediaPorDiaAtivo: p.dias.size ? Math.round((p.total / p.dias.size) * 10) / 10 : 0,
      ultimoDia: p.ultimoDia,
      falhas: p.falhas,
    }))
    .sort((a, b) => b.total - a.total);

  const topPessoas = porPessoa.slice(0, 6);
  const topPessoasChaves = topPessoas.map((p, i) => ({
    chave: p.id,
    nome: p.nome,
    cor: CORES_PESSOAS[i % CORES_PESSOAS.length],
  }));

  // Período longo vira semanas pra o gráfico continuar legível.
  const spanDias = primeiroDia && ultimoDia ? Math.round((paraData(ultimoDia).getTime() - paraData(primeiroDia).getTime()) / 86400000) + 1 : 0;
  const agrupamento: "dia" | "semana" = spanDias > 45 ? "semana" : "dia";
  const bucket = (dia: string) => (agrupamento === "semana" ? inicioDaSemana(dia) : dia);

  const buckets: string[] = [];
  if (primeiroDia && ultimoDia) {
    const passo = agrupamento === "semana" ? 7 : 1;
    const d = paraData(bucket(primeiroDia));
    const fim = paraData(ultimoDia);
    while (d <= fim) {
      buckets.push(paraIso(d));
      d.setUTCDate(d.getUTCDate() + passo);
    }
  }

  const modulosPorBucket = new Map<string, Record<string, number>>();
  const pessoasPorBucket = new Map<string, Map<string, number>>();
  for (const [dia, mods] of porDiaModulo) {
    const b = bucket(dia);
    const acc = modulosPorBucket.get(b) ?? {};
    for (const [k, v] of Object.entries(mods)) acc[k] = (acc[k] ?? 0) + v;
    modulosPorBucket.set(b, acc);
  }
  for (const [dia, pp] of porDiaPessoa) {
    const b = bucket(dia);
    const acc = pessoasPorBucket.get(b) ?? new Map<string, number>();
    for (const [k, v] of pp) acc.set(k, (acc.get(k) ?? 0) + v);
    pessoasPorBucket.set(b, acc);
  }

  const serieModulos = buckets.map((b) => {
    const mods = modulosPorBucket.get(b) ?? {};
    const ponto: Record<string, string | number> = { dia: rotulo(b) };
    for (const m of MODULOS) ponto[m.chave] = mods[m.chave] ?? 0;
    return ponto;
  });

  const serie = buckets.map((b) => {
    const pp = pessoasPorBucket.get(b) ?? new Map<string, number>();
    const ponto: Record<string, string | number> = { dia: rotulo(b) };
    for (const p of topPessoasChaves) ponto[p.chave] = pp.get(p.chave) ?? 0;
    return ponto;
  });

  const serieSemana = buckets.map((b) => {
    const mods = modulosPorBucket.get(b) ?? {};
    return { dia: rotulo(b), total: Object.values(mods).reduce((s, v) => s + v, 0) };
  });

  const nomesDiaSemana = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return {
    totalProdutivo,
    totalFalhas,
    totalDesfeitos,
    retroativos,
    pessoas: porPessoa.filter((p) => p.total > 0).length,
    diasAtivos: dias.length,
    mediaPorDiaAtivo: dias.length ? Math.round((totalProdutivo / dias.length) * 10) / 10 : 0,
    melhorDia,
    primeiroDia,
    ultimoDia,
    porModulo: MODULOS.map((m) => ({ ...m, total: totalModulo[m.chave] ?? 0 })),
    porPessoa,
    serie,
    agrupamento,
    serieModulos,
    serieSemana,
    topPessoasChaves,
    porDiaSemana: nomesDiaSemana.map((dia, i) => ({ dia, total: diaSemana[i] })),
  };
}

export type LinhaSituacao = { usuario_id: string; modulo: string; situacao: string; total: number };

export type SituacaoPessoa = {
  id: string;
  nome: string;
  ok: number;
  pendencia: number;
  andamento: number;
  total: number;
  porModulo: Record<string, { ok: number; pendencia: number }>;
};

export function calcularSituacao(linhas: LinhaSituacao[], pessoas: { id: string; nome: string }[]): SituacaoPessoa[] {
  const mapa = new Map<string, SituacaoPessoa>();
  for (const p of pessoas) {
    mapa.set(p.id, { id: p.id, nome: p.nome, ok: 0, pendencia: 0, andamento: 0, total: 0, porModulo: {} });
  }
  for (const l of linhas) {
    const n = Number(l.total);
    const p = mapa.get(l.usuario_id) ?? { id: l.usuario_id, nome: "Desconhecido", ok: 0, pendencia: 0, andamento: 0, total: 0, porModulo: {} };
    mapa.set(l.usuario_id, p);
    p.total += n;
    const m = (p.porModulo[l.modulo] ??= { ok: 0, pendencia: 0 });
    if (l.situacao === "ok") {
      p.ok += n;
      m.ok += n;
    } else if (l.situacao === "pendencia") {
      p.pendencia += n;
      m.pendencia += n;
    } else {
      p.andamento += n;
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function formatarDia(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

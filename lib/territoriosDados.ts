import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNome, type ParteDoTerritorio } from "@/lib/territorios";

type Muni = { n: string; t: string | null };

let cacheMapa: Map<string, string> | null = null;

/** Município (nome normalizado) -> território. */
export async function territorioPorMunicipio(): Promise<Map<string, string>> {
  if (!cacheMapa) {
    const munis = (await import("@/data/geo/municipios_pi.json")).default as unknown as Muni[];
    cacheMapa = new Map();
    for (const m of munis) if (m.t) cacheMapa.set(normalizarNome(m.n), m.t);
  }
  return cacheMapa;
}

/** Município (nome normalizado) -> nome como está na base (com acentos e maiúsculas certas). Para listar até os municípios sem ação. */
export async function nomesDosMunicipios(): Promise<Record<string, string>> {
  const munis = (await import("@/data/geo/municipios_pi.json")).default as unknown as Muni[];
  const nomes: Record<string, string> = {};
  for (const m of munis) if (m.t) nomes[normalizarNome(m.n)] = m.n;
  return nomes;
}

export type TerritoriosDaAcao = {
  partes: ParteDoTerritorio[];
  origem: "tracado" | "municipio" | "nenhuma";
  extensaoM: number;
  /** Municípios do traçado, do maior para o menor (nome como está na base de bairros). */
  municipios: { nome: string; pct: number }[];
};

/**
 * Em quais territórios cada ação cai, pelo traçado (o cálculo da Verificação de bairros: município por município)
 * e, quando não há traçado, pelo município que veio do SIMO (campo "extra" da ação).
 */
export async function territoriosDasAcoes(supabase: SupabaseClient, extras: Map<string, Record<string, string> | null>): Promise<{ porAcao: Map<string, TerritoriosDaAcao>; erro: string | null }> {
  const mapa = await territorioPorMunicipio();
  const porAcao = new Map<string, TerritoriosDaAcao>();
  let erro: string | null = null;

  // Metros e pontos por ação e município (somando os bairros).
  const acum = new Map<string, Map<string, { metros: number; pontos: number }>>();
  const acumMun = new Map<string, Map<string, { metros: number; pontos: number }>>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acao_bairros").select("id_acao, municipio, metros, pontos").order("id_acao").range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    for (const r of data ?? []) {
      const t = mapa.get(normalizarNome((r.municipio as string) ?? ""));
      if (!t) continue;
      let porM = acumMun.get(r.id_acao as string);
      if (!porM) acumMun.set(r.id_acao as string, (porM = new Map()));
      const m = porM.get(r.municipio as string) ?? { metros: 0, pontos: 0 };
      m.metros += (r.metros as number) ?? 0;
      m.pontos += (r.pontos as number) ?? 0;
      porM.set(r.municipio as string, m);
      let porT = acum.get(r.id_acao as string);
      if (!porT) acum.set(r.id_acao as string, (porT = new Map()));
      const x = porT.get(t) ?? { metros: 0, pontos: 0 };
      x.metros += (r.metros as number) ?? 0;
      x.pontos += (r.pontos as number) ?? 0;
      porT.set(t, x);
    }
    if (!data || data.length < 1000) break;
  }
  const extensoes = new Map<string, number>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acao_bairros_calculo").select("id_acao, extensao_m").order("id_acao").range(de, de + 999);
    if (error) {
      erro = erro ?? error.message;
      break;
    }
    for (const r of data ?? []) extensoes.set(r.id_acao as string, (r.extensao_m as number) ?? 0);
    if (!data || data.length < 1000) break;
  }

  for (const [id, porT] of acum) {
    const temMetros = Array.from(porT.values()).some((x) => x.metros > 0);
    const peso = (x: { metros: number; pontos: number }) => (temMetros ? x.metros : x.pontos);
    const total = Array.from(porT.values()).reduce((s, x) => s + peso(x), 0);
    if (total <= 0) continue;
    const partes: ParteDoTerritorio[] = Array.from(porT, ([nome, x]) => ({ nome, pct: peso(x) / total, metros: Math.round(x.metros), pontos: x.pontos })).sort((a, b) => b.pct - a.pct);
    const porM = acumMun.get(id) ?? new Map();
    const totalM = Array.from(porM.values()).reduce((s, x) => s + peso(x), 0);
    const municipios = Array.from(porM, ([nome, x]) => ({ nome, pct: totalM > 0 ? peso(x) / totalM : 0 })).sort((a, b) => b.pct - a.pct);
    porAcao.set(id, { partes, origem: "tracado", extensaoM: extensoes.get(id) ?? 0, municipios });
  }

  // Sem traçado: o município que o SIMO informou (se a coluna existir). O SIMO pode juntar vários na mesma célula com " - "
  // (ex.: "PIRACURUCA - PIRACURUCA", "TERESINA - UNIÃO"): separa, tira repetidos e divide a ação em partes iguais entre os territórios.
  for (const [id, extra] of extras) {
    if (porAcao.has(id) || !extra) continue;
    const chaves = Object.keys(extra);
    const chave = chaves.find((k) => /localiza/i.test(k) && /munic/i.test(k)) ?? chaves.find((k) => /munic/i.test(k) && !/bairro/i.test(k));
    if (!chave) continue;
    const nomes: string[] = [];
    const vistos = new Set<string>();
    for (const p of (extra[chave] ?? "").split(/\s+-\s+|\s*;\s*/)) {
      const nome = p.trim();
      const n = normalizarNome(nome);
      if (nome && !vistos.has(n)) {
        vistos.add(n);
        nomes.push(nome);
      }
    }
    const territorios = Array.from(new Set(nomes.map((n) => mapa.get(normalizarNome(n))).filter((t): t is string => !!t)));
    if (territorios.length === 0) continue;
    porAcao.set(id, {
      partes: territorios.map((nome) => ({ nome, pct: 1 / territorios.length, metros: 0, pontos: 0 })),
      origem: "municipio",
      extensaoM: 0,
      municipios: nomes.map((nome) => ({ nome, pct: 1 / nomes.length })),
    });
  }
  return { porAcao, erro };
}

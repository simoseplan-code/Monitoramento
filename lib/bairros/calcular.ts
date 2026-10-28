import { amostrar, comprimentoM } from "@/lib/kml/analisar";
import type { IndiceSetores } from "@/lib/bairros/setores";

type Coord = [number, number]; // [lon, lat]
type Poligono = number[][][]; // [anel externo, ...furos], cada ponto [lon, lat]

type Zona = { b: [number, number, number, number]; g: Poligono[] };
export type Bairro = Zona & { n: string; m: string; z?: string };
export type Municipio = Zona & { n: string; c?: string; t?: string | null };

export type BairroDaAcao = { municipio: string; bairro: string; metros: number; pct: number; pontos: number };
/** Parte do traçado que está num município mas não em nenhum bairro do arquivo. */
export type SemBairroDaAcao = { municipio: string; metros: number; pct: number; pontos: number };

export type ResultadoBairros = {
  extensaoM: number;
  /** Metros que não caem em nenhum município do Piauí (nem em bairro). */
  metrosFora: number;
  pontos: number;
  /** Pontos que não caem em nenhum município do Piauí. */
  pontosFora: number;
  bairros: BairroDaAcao[];
  semBairro: SemBairroDaAcao[];
  /** Quanto do trecho (m) e quantos pontos caem em setor urbano e em setor rural (IBGE). */
  zona: { metrosUrbano: number; metrosRural: number; pontosUrbano: number; pontosRural: number };
};

const ZONA_ZERO = { metrosUrbano: 0, metrosRural: 0, pontosUrbano: 0, pontosRural: 0 };

// Um ponto a cada 15 m basta para saber em que bairros o trecho passa.
const PASSO_M = 15;
// Ignora quem só "encosta" no bairro (menos de 2% do trecho e menos de 30 m).
const MIN_PCT = 0.02;
const MIN_METROS = 30;

let cacheBairros: Bairro[] | null = null;
export async function carregarBairros(): Promise<Bairro[]> {
  if (!cacheBairros) cacheBairros = (await import("@/data/geo/bairros_pi.json")).default as unknown as Bairro[];
  return cacheBairros;
}

let cacheMunicipios: Municipio[] | null = null;
export async function carregarMunicipios(): Promise<Municipio[]> {
  if (!cacheMunicipios) cacheMunicipios = (await import("@/data/geo/municipios_pi.json")).default as unknown as Municipio[];
  return cacheMunicipios;
}

function dentroDoAnel(p: Coord, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDaZona(p: Coord, z: Zona): boolean {
  if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) return false;
  for (const poligono of z.g) {
    if (dentroDoAnel(p, poligono[0]) && !poligono.slice(1).some((furo) => dentroDoAnel(p, furo))) return true;
  }
  return false;
}

/**
 * Em que bairros o traçado cai. `linhas` (trechos, e o contorno dos polígonos) contam em metros;
 * `pontosKml` (locais marcados) contam em quantidade. O que não cai em nenhum bairro é atribuído ao
 * município onde está (`semBairro`), para pelo menos saber de que cidade é.
 */
export function bairrosDoTracado(linhas: Coord[][], bairros: Bairro[], pontosKml: Coord[] = [], municipios: Municipio[] = [], setores?: IndiceSetores): ResultadoBairros {
  const extensaoM = linhas.reduce((s, l) => s + comprimentoM(l), 0);
  const amostras = extensaoM > 0 ? linhas.flatMap((l) => amostrar(l, PASSO_M)) : [];
  if (amostras.length === 0 && pontosKml.length === 0) return { extensaoM, metrosFora: 0, pontos: 0, pontosFora: 0, bairros: [], semBairro: [], zona: ZONA_ZERO };

  // Só as zonas cuja caixa encosta na caixa do que foi marcado.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of [...amostras, ...pontosKml]) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const tocaCaixa = (z: Zona) => !(z.b[2] < x0 || z.b[0] > x1 || z.b[3] < y0 || z.b[1] > y1);
  const candidatos = bairros.filter(tocaCaixa);
  const munCandidatos = municipios.filter(tocaCaixa);
  const municipioDe = (p: Coord): string | null => munCandidatos.find((m) => dentroDaZona(p, m))?.n ?? null;

  const metrosPorAmostra = amostras.length ? extensaoM / amostras.length : 0;
  // Agrupa pelo nome (município + bairro): o arquivo tem dois polígonos com o mesmo nome em Teresina
  // (São Sebastião e Uruguai), e cada bairro só pode aparecer uma vez por ação.
  const chave = (b: Bairro) => `${b.m}|${b.n}`;
  const nomes = new Map<string, Bairro>();
  const amostrasPorBairro = new Map<string, number>();
  const pontosPorBairro = new Map<string, number>();
  const amostrasSemBairro = new Map<string, number>(); // por município
  const pontosSemBairro = new Map<string, number>();
  let foraAmostras = 0;
  let pontosFora = 0;
  const soma = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let amostrasU = 0, amostrasR = 0, pontosU = 0, pontosR = 0;

  for (const p of amostras) {
    const z = setores?.zonaDe(p);
    if (z === "U") amostrasU++;
    else if (z === "R") amostrasR++;
    const achado = candidatos.find((b) => dentroDaZona(p, b));
    if (achado) {
      nomes.set(chave(achado), achado);
      soma(amostrasPorBairro, chave(achado));
    } else {
      const m = municipioDe(p);
      if (m) soma(amostrasSemBairro, m);
      else foraAmostras++;
    }
  }
  for (const p of pontosKml) {
    const z = setores?.zonaDe(p);
    if (z === "U") pontosU++;
    else if (z === "R") pontosR++;
    const achado = candidatos.find((b) => dentroDaZona(p, b));
    if (achado) {
      nomes.set(chave(achado), achado);
      soma(pontosPorBairro, chave(achado));
    } else {
      const m = municipioDe(p);
      if (m) soma(pontosSemBairro, m);
      else pontosFora++;
    }
  }

  const pctDe = (metros: number, pontos: number) => (extensaoM > 0 ? metros / extensaoM : pontosKml.length ? pontos / pontosKml.length : 0);

  const lista: BairroDaAcao[] = [];
  for (const k of new Set([...amostrasPorBairro.keys(), ...pontosPorBairro.keys()])) {
    const b = nomes.get(k)!;
    const n = amostrasPorBairro.get(k) ?? 0;
    const pontos = pontosPorBairro.get(k) ?? 0;
    const metros = n * metrosPorAmostra;
    const pct = pctDe(metros, pontos);
    if (pontos === 0 && pct < MIN_PCT && metros < MIN_METROS) {
      // Só encosta no bairro: conta como "sem bairro" do município.
      for (let i = 0; i < n; i++) soma(amostrasSemBairro, b.m);
    } else lista.push({ municipio: b.m, bairro: b.n, metros: Math.round(metros), pct: Math.round(pct * 1000) / 1000, pontos });
  }
  lista.sort((a, b) => b.metros - a.metros || b.pontos - a.pontos);

  const semBairro: SemBairroDaAcao[] = [];
  let descartado = 0;
  for (const m of new Set([...amostrasSemBairro.keys(), ...pontosSemBairro.keys()])) {
    const n = amostrasSemBairro.get(m) ?? 0;
    const pontos = pontosSemBairro.get(m) ?? 0;
    const metros = n * metrosPorAmostra;
    const pct = pctDe(metros, pontos);
    if (pontos === 0 && pct < MIN_PCT && metros < MIN_METROS) descartado += n;
    else semBairro.push({ municipio: m, metros: Math.round(metros), pct: Math.round(pct * 1000) / 1000, pontos });
  }
  semBairro.sort((a, b) => b.metros - a.metros || b.pontos - a.pontos);

  return {
    extensaoM,
    metrosFora: Math.round((foraAmostras + descartado) * metrosPorAmostra),
    pontos: pontosKml.length,
    pontosFora,
    bairros: lista,
    semBairro,
    zona: { metrosUrbano: Math.round(amostrasU * metrosPorAmostra), metrosRural: Math.round(amostrasR * metrosPorAmostra), pontosUrbano: pontosU, pontosRural: pontosR },
  };
}

import { amostrar, comprimentoM } from "@/lib/kml/analisar";

type Coord = [number, number]; // [lon, lat]
type Poligono = number[][][]; // [anel externo, ...furos], cada ponto [lon, lat]

export type Bairro = { n: string; m: string; z?: string; b: [number, number, number, number]; g: Poligono[] };

export type BairroDaAcao = { municipio: string; bairro: string; metros: number; pct: number; pontos: number };

export type ResultadoBairros = {
  extensaoM: number;
  metrosFora: number;
  pontos: number;
  pontosFora: number;
  bairros: BairroDaAcao[];
};

// Um ponto a cada 15 m basta para saber em que bairros o trecho passa.
const PASSO_M = 15;
// Ignora quem só "encosta" no bairro (menos de 2% do trecho e menos de 30 m).
const MIN_PCT = 0.02;
const MIN_METROS = 30;

let cache: Bairro[] | null = null;
export async function carregarBairros(): Promise<Bairro[]> {
  if (!cache) cache = (await import("@/data/geo/bairros_pi.json")).default as unknown as Bairro[];
  return cache;
}

function dentroDoAnel(p: Coord, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDoBairro(p: Coord, z: Bairro): boolean {
  if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) return false;
  for (const poligono of z.g) {
    if (dentroDoAnel(p, poligono[0]) && !poligono.slice(1).some((furo) => dentroDoAnel(p, furo))) return true;
  }
  return false;
}

/**
 * Em que bairros o traçado cai. `linhas` (trechos, e o contorno dos polígonos) contam em metros;
 * `pontos` (locais marcados no KML) contam em quantidade.
 */
export function bairrosDoTracado(linhas: Coord[][], bairros: Bairro[], pontosKml: Coord[] = []): ResultadoBairros {
  const extensaoM = linhas.reduce((s, l) => s + comprimentoM(l), 0);
  const amostras = extensaoM > 0 ? linhas.flatMap((l) => amostrar(l, PASSO_M)) : [];
  if (amostras.length === 0 && pontosKml.length === 0) return { extensaoM, metrosFora: 0, pontos: 0, pontosFora: 0, bairros: [] };

  // Só os bairros cuja caixa encosta na caixa do que foi marcado.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of [...amostras, ...pontosKml]) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const candidatos = bairros.filter((b) => !(b.b[2] < x0 || b.b[0] > x1 || b.b[3] < y0 || b.b[1] > y1));

  const metrosPorAmostra = amostras.length ? extensaoM / amostras.length : 0;
  const amostrasPorBairro = new Map<Bairro, number>();
  const pontosPorBairro = new Map<Bairro, number>();
  let foraAmostras = 0;
  for (const p of amostras) {
    const achado = candidatos.find((b) => dentroDoBairro(p, b));
    if (achado) amostrasPorBairro.set(achado, (amostrasPorBairro.get(achado) ?? 0) + 1);
    else foraAmostras++;
  }
  let pontosFora = 0;
  for (const p of pontosKml) {
    const achado = candidatos.find((b) => dentroDoBairro(p, b));
    if (achado) pontosPorBairro.set(achado, (pontosPorBairro.get(achado) ?? 0) + 1);
    else pontosFora++;
  }

  const lista: BairroDaAcao[] = [];
  let descartadoAmostras = 0;
  for (const b of new Set([...amostrasPorBairro.keys(), ...pontosPorBairro.keys()])) {
    const n = amostrasPorBairro.get(b) ?? 0;
    const pontos = pontosPorBairro.get(b) ?? 0;
    const metros = n * metrosPorAmostra;
    // Com trecho, a % é a parte do trecho; ação só de pontos, a % é a parte dos pontos.
    const pct = extensaoM > 0 ? metros / extensaoM : pontos / pontosKml.length;
    const soEncosta = pontos === 0 && pct < MIN_PCT && metros < MIN_METROS;
    if (soEncosta) descartadoAmostras += n;
    else lista.push({ municipio: b.m, bairro: b.n, metros: Math.round(metros), pct: Math.round(pct * 1000) / 1000, pontos });
  }
  lista.sort((a, b) => b.metros - a.metros || b.pontos - a.pontos);
  return {
    extensaoM,
    metrosFora: Math.round((foraAmostras + descartadoAmostras) * metrosPorAmostra),
    pontos: pontosKml.length,
    pontosFora,
    bairros: lista,
  };
}

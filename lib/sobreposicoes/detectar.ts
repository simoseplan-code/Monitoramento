import bbox from "@turf/bbox";
import lineOverlap from "@turf/line-overlap";
import length from "@turf/length";
import type { ObraNoLocal, SobreposicaoImportada } from "@/lib/sobreposicoes/parseCsv";

// Detecção de sobreposição de trechos: porte do algoritmo do mapa (index.html, seção
// "Sobreposição de Trechos") para rodar no servidor, em cima do mesmo arquivo de linhas das
// obras (obras_linhas.geojson). Mantém as mesmas regras do mapa para o resultado bater:
//  - ações "TD" nunca entram; só entram ações criadas a partir de 2023;
//  - compara as obras par a par (lineOverlap) e depois junta pedaços do MESMO local físico;
//  - dois pedaços são o mesmo local quando o trecho comum cobre mais de 60% dos dois.

export const TOLERANCIA_PADRAO_M = 15;

type LineString = { type: "LineString"; coordinates: number[][] };
type MultiLineString = { type: "MultiLineString"; coordinates: number[][][] };
type Geometria = LineString | MultiLineString;
type Feature<G = Geometria> = { type: "Feature"; geometry: G; properties: Record<string, unknown> | null };
export type FeicaoLinha = { type: "Feature"; geometry: Geometria | null; properties: Record<string, unknown> | null };
type Caixa = [number, number, number, number];

const PADROES_TD = ["TD-", "TD0", "TD -", "TD 0", "TD 1"];

function nomeDaObra(p: Record<string, unknown> | null): string {
  return (p?.["Nome da Ação"] as string) || "Obra sem nome";
}
function ehTD(p: Record<string, unknown> | null): boolean {
  const nome = String(p?.["Nome da Ação"] ?? "").toUpperCase();
  return PADROES_TD.some((x) => nome.includes(x));
}
function criadaApartirDe2023(p: Record<string, unknown> | null): boolean {
  const data = p?.["Data Inicio"];
  if (!data) return true;
  const m = String(data).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) >= 2023 : true;
}

function caixasSeTocam(a: Caixa, b: Caixa, folga: number): boolean {
  return a[0] - folga <= b[2] + folga && a[2] + folga >= b[0] - folga && a[1] - folga <= b[3] + folga && a[3] + folga >= b[1] - folga;
}

function wkt(geometrias: (Geometria | null | undefined)[]): string {
  const partes: string[] = [];
  for (const g of geometrias) {
    if (!g?.coordinates) continue;
    const linhas = g.type === "MultiLineString" ? g.coordinates : [g.coordinates];
    for (const l of linhas) {
      if (l.length < 2) continue;
      partes.push("(" + l.map((c) => `${Number(c[0].toFixed(6))} ${Number(c[1].toFixed(6))}`).join(", ") + ")");
    }
  }
  if (partes.length === 0) return "";
  return partes.length === 1 ? "LINESTRING" + partes[0] : "MULTILINESTRING(" + partes.join(", ") + ")";
}

type Segmento = {
  obraA: ObraNoLocal;
  obraB: ObraNoLocal;
  comprimentoM: number;
  geometria: Feature<LineString | MultiLineString>;
  caixa: Caixa;
};

export type ResultadoDeteccao = {
  locais: SobreposicaoImportada[];
  /** Trecho(s) sobreposto(s) de cada local (WKT), pela chave do local. */
  geomPorLocal: Map<string, string[]>;
  /** Traçado completo de cada ação (todos os trechos dela juntos), em WKT. */
  tracadoPorObra: Map<string, string>;
  estatisticas: { linhasConsideradas: number; paresComparados: number; segmentos: number };
};

export function detectarSobreposicoes(features: FeicaoLinha[], toleranciaM = TOLERANCIA_PADRAO_M): ResultadoDeteccao {
  const tolKm = toleranciaM / 1000;
  const folga = (toleranciaM + 30) / 111000;

  const linhas = features.filter(
    (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString") && !ehTD(f.properties) && criadaApartirDe2023(f.properties)
  );
  const comCaixa = linhas
    .map((f) => ({ f: f as Feature<Geometria>, caixa: bbox(f as Feature<Geometria>) as Caixa }))
    .filter((x) => x.caixa.every(Number.isFinite));

  const obraDe = (p: Record<string, unknown> | null): ObraNoLocal => ({
    id: p?.["ID da Ação"] != null ? String(p["ID da Ação"]) : null,
    nome: nomeDaObra(p),
    orgao: (p?.["Orgão da Açao"] as string) || null,
    status: (p?.["Status"] as string) || null,
    contrato: (p?.["Número do Contrato no SIAFE"] as string) || null,
  });

  // Passo 1: sobreposição par a par entre obras diferentes.
  const brutos: Segmento[] = [];
  let pares = 0;
  for (let i = 0; i < comCaixa.length; i++) {
    for (let j = i + 1; j < comCaixa.length; j++) {
      const A = comCaixa[i], B = comCaixa[j];
      if (!caixasSeTocam(A.caixa, B.caixa, folga)) continue;
      const idA = A.f.properties?.["ID da Ação"], idB = B.f.properties?.["ID da Ação"];
      // Pedaços da MESMA obra (multi-trecho) não contam entre si.
      if (idA != null && idB != null && String(idA) === String(idB)) continue;
      pares++;
      let overlap;
      try {
        overlap = lineOverlap(A.f as Feature<Geometria>, B.f as Feature<Geometria>, { tolerance: tolKm });
      } catch {
        continue;
      }
      if (!overlap?.features?.length) continue;
      const obraA = obraDe(A.f.properties), obraB = obraDe(B.f.properties);
      for (const seg of overlap.features) {
        const cx = bbox(seg) as Caixa;
        if (!cx.every(Number.isFinite)) continue;
        brutos.push({ obraA, obraB, comprimentoM: length(seg, { units: "kilometers" }) * 1000, geometria: seg as unknown as Feature<Geometria>, caixa: cx });
      }
    }
  }

  // Passo 2: junta pedaços de pares diferentes que caem no mesmo local físico (union-find).
  const n = brutos.length;
  const pai = Array.from({ length: n }, (_, i) => i);
  const achar = (x: number): number => {
    while (pai[x] !== x) {
      pai[x] = pai[pai[x]];
      x = pai[x];
    }
    return x;
  };
  const unir = (a: number, b: number) => {
    const ra = achar(a), rb = achar(b);
    if (ra !== rb) pai[ra] = rb;
  };

  const tamanhoCel = 0.02;
  const grade = new Map<string, number[]>();
  brutos.forEach((s, idx) => {
    const cx0 = Math.floor(s.caixa[0] / tamanhoCel), cx1 = Math.floor(s.caixa[2] / tamanhoCel);
    const cy0 = Math.floor(s.caixa[1] / tamanhoCel), cy1 = Math.floor(s.caixa[3] / tamanhoCel);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = `${cx}_${cy}`;
        const arr = grade.get(k);
        if (arr) arr.push(idx);
        else grade.set(k, [idx]);
      }
  });

  grade.forEach((candidatos) => {
    for (let a = 0; a < candidatos.length; a++) {
      for (let b = a + 1; b < candidatos.length; b++) {
        const i = candidatos[a], j = candidatos[b];
        if (achar(i) === achar(j)) continue;
        if (!caixasSeTocam(brutos[i].caixa, brutos[j].caixa, folga)) continue;
        let mesmoLocal = false;
        try {
          const ov = lineOverlap(brutos[i].geometria, brutos[j].geometria, { tolerance: tolKm });
          if (ov?.features?.length) {
            const len = ov.features.reduce((s: number, f: unknown) => s + length(f, { units: "kilometers" }) * 1000, 0);
            // Cobrir a maior parte dos DOIS pedaços: senão uma rodovia enorme vira "ponte"
            // que junta obras sem relação, cada uma tocando-a num ponto distante.
            mesmoLocal = len / brutos[i].comprimentoM > 0.6 && len / brutos[j].comprimentoM > 0.6;
          }
        } catch {
          mesmoLocal = false;
        }
        if (mesmoLocal) unir(i, j);
      }
    }
  });

  // Passo 3: um grupo por cluster, juntando as obras únicas.
  const clusters = new Map<number, { obras: Map<string, ObraNoLocal>; segs: Segmento[] }>();
  for (let i = 0; i < n; i++) {
    const raiz = achar(i);
    let c = clusters.get(raiz);
    if (!c) {
      c = { obras: new Map(), segs: [] };
      clusters.set(raiz, c);
    }
    c.segs.push(brutos[i]);
    for (const o of [brutos[i].obraA, brutos[i].obraB]) {
      const chave = String(o.id != null ? o.id : o.nome);
      if (!c.obras.has(chave)) c.obras.set(chave, o);
    }
  }

  const locais: SobreposicaoImportada[] = [];
  const geomPorLocal = new Map<string, string[]>();
  const grupos = Array.from(clusters.values())
    .map((c) => {
      const maior = c.segs.reduce((m, s) => (s.comprimentoM > m.comprimentoM ? s : m), c.segs[0]);
      return { obras: Array.from(c.obras.values()), maior, segs: c.segs };
    })
    .sort((a, b) => b.maior.comprimentoM - a.maior.comprimentoM);

  for (const g of grupos) {
    const coords = (g.maior.geometria.geometry.type === "MultiLineString" ? g.maior.geometria.geometry.coordinates[0] : g.maior.geometria.geometry.coordinates) ?? [];
    const inicio = coords[0] ?? null;
    const fim = coords[coords.length - 1] ?? null;
    // Chave estável do local (igual à do CSV): IDs das obras, ordenados, + coordenada de início.
    const coordChave = inicio ? `${inicio[1].toFixed(5)},${inicio[0].toFixed(5)}` : "semcoord";
    const chaveLocal =
      g.obras
        .map((o) => (o.id != null ? String(o.id) : "N:" + o.nome))
        .sort()
        .join("+") +
      "@" +
      coordChave;
    if (geomPorLocal.has(chaveLocal)) continue; // mesma chave (coordenada idêntica): mantém o primeiro, como o CSV deduplicaria
    locais.push({
      chave_local: chaveLocal,
      obras: g.obras,
      qtd_obras: g.obras.length,
      extensao_m: Math.round(g.maior.comprimentoM),
      tolerancia_m: toleranciaM,
      qtd_segmentos: g.segs.length,
      lat_inicio: inicio ? Number(inicio[1].toFixed(6)) : null,
      lon_inicio: inicio ? Number(inicio[0].toFixed(6)) : null,
      lat_fim: fim ? Number(fim[1].toFixed(6)) : null,
      lon_fim: fim ? Number(fim[0].toFixed(6)) : null,
    });
    const w = wkt(g.segs.map((s) => s.geometria.geometry));
    geomPorLocal.set(chaveLocal, w ? [w] : []);
  }

  // Traçado completo de cada ação (todas as linhas, inclusive as que ficaram de fora da detecção).
  const porObra = new Map<string, Geometria[]>();
  for (const f of features) {
    const id = f.properties?.["ID da Ação"];
    if (id == null || !f.geometry) continue;
    const k = String(id);
    const lista = porObra.get(k);
    if (lista) lista.push(f.geometry);
    else porObra.set(k, [f.geometry]);
  }
  const tracadoPorObra = new Map<string, string>();
  for (const [id, geoms] of porObra) {
    const w = wkt(geoms);
    if (w) tracadoPorObra.set(id, w);
  }

  return { locais, geomPorLocal, tracadoPorObra, estatisticas: { linhasConsideradas: comCaixa.length, paresComparados: pares, segmentos: n } };
}

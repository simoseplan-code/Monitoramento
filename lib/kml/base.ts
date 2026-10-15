import { amostrar, comprimentoM, distanciaM, type ResultadoKml, type SobreposicaoNaBase } from "@/lib/kml/analisar";

type Coord = [number, number]; // [lon, lat]

export type TracadoBase = { idAcao: string; fonte: "sobreposicoes" | "kml"; linhas: Coord[][] };

/** LINESTRING / MULTILINESTRING (WKT) em listas de [lon, lat]. */
export function wktParaLinhasLonLat(wkt: string): Coord[][] {
  const saida: Coord[][] = [];
  for (const g of wkt.match(/\(([^()]+)\)/g) ?? []) {
    const pts: Coord[] = [];
    for (const par of g.slice(1, -1).split(",")) {
      const [x, y] = par.trim().split(/\s+/).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
    if (pts.length >= 2) saida.push(pts);
  }
  return saida;
}

export function linhasParaWkt(linhas: Coord[][], casas = 5): string {
  const f = (n: number) => String(Number(n.toFixed(casas)));
  return `MULTILINESTRING(${linhas.map((l) => `(${l.map((p) => `${f(p[0])} ${f(p[1])}`).join(", ")})`).join(", ")})`;
}

const CELULA = 0.0005; // ~55 m: maior que a tolerância, então basta olhar a célula e as vizinhas
const PASSO_INDICE_M = 20;
const PASSO_AMOSTRA_M = 10;

type Segmento = { a: Coord; b: Coord; dono: number };

function chaveCelula(x: number, y: number): string {
  return `${Math.floor(x / CELULA)}:${Math.floor(y / CELULA)}`;
}

/** Distância (m) de um ponto a um segmento, em plano local (suficiente para dezenas de metros). */
function distPontoSegmentoM(p: Coord, a: Coord, b: Coord): number {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110574;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Compara os trechos do KML analisado com os trechos de outras ações já guardadas (traçados
 * vindos do CSV de Sobreposições e KMLs já analisados). Um ponto do KML conta como sobreposto
 * quando fica a até `toleranciaM` metros de um trecho de outra ação.
 */
export function compararComBase(
  linhasKml: Coord[][],
  base: TracadoBase[],
  toleranciaM = 10
): { itens: SobreposicaoNaBase[]; comparadas: number; linhasDasOutras: Map<string, Coord[][]> } {
  const itens: SobreposicaoNaBase[] = [];
  const linhasDasOutras = new Map<string, Coord[][]>();
  const todasKml = linhasKml.flat();
  if (todasKml.length === 0 || base.length === 0) return { itens, comparadas: base.length, linhasDasOutras };

  // Caixa do KML (com folga) para ignorar rápido as ações que estão longe.
  const folga = 0.001;
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of todasKml) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  x0 -= folga; y0 -= folga; x1 += folga; y1 += folga;

  const candidatas = base.filter((b) => b.linhas.some((l) => l.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)));
  if (candidatas.length === 0) return { itens, comparadas: base.length, linhasDasOutras };

  // Índice por células: cada segmento entra nas células por onde passa (de 20 em 20 m).
  const grade = new Map<string, Segmento[]>();
  const extensaoDoDono: number[] = candidatas.map((c) => c.linhas.reduce((s, l) => s + comprimentoM(l), 0));
  candidatas.forEach((c, dono) => {
    for (const linha of c.linhas) {
      for (let i = 1; i < linha.length; i++) {
        const seg: Segmento = { a: linha[i - 1], b: linha[i], dono };
        const n = Math.max(1, Math.ceil(distanciaM(seg.a, seg.b) / PASSO_INDICE_M));
        const vistas = new Set<string>();
        for (let k = 0; k <= n; k++) {
          const x = seg.a[0] + ((seg.b[0] - seg.a[0]) * k) / n;
          const y = seg.a[1] + ((seg.b[1] - seg.a[1]) * k) / n;
          const ch = chaveCelula(x, y);
          if (vistas.has(ch)) continue;
          vistas.add(ch);
          const lista = grade.get(ch);
          if (lista) lista.push(seg);
          else grade.set(ch, [seg]);
        }
      }
    }
  });

  const metrosPorDono = new Float64Array(candidatas.length);
  let totalKmlM = 0;
  for (const linha of linhasKml) {
    const amostras = amostrar(linha, PASSO_AMOSTRA_M);
    totalKmlM += comprimentoM(linha);
    const peso = amostras.length > 1 ? comprimentoM(linha) / amostras.length : 0;
    for (const p of amostras) {
      const cx = Math.floor(p[0] / CELULA), cy = Math.floor(p[1] / CELULA);
      const donosAqui = new Set<number>();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const seg of grade.get(`${cx + dx}:${cy + dy}`) ?? []) {
            if (donosAqui.has(seg.dono)) continue;
            if (distPontoSegmentoM(p, seg.a, seg.b) <= toleranciaM) donosAqui.add(seg.dono);
          }
        }
      }
      for (const d of donosAqui) metrosPorDono[d] += peso;
    }
  }

  candidatas.forEach((c, dono) => {
    const metros = metrosPorDono[dono];
    if (metros < 30) return; // menos de 30 m é só um cruzamento ou encontro de pontas
    itens.push({
      idAcao: c.idAcao,
      nome: null,
      orgao: null,
      status: null,
      fonte: c.fonte,
      metros: Math.round(metros),
      pctDoKml: totalKmlM > 0 ? Math.round((metros / totalKmlM) * 1000) / 10 : 0,
      pctDaOutra: extensaoDoDono[dono] > 0 ? Math.round((metros / extensaoDoDono[dono]) * 1000) / 10 : 0,
    });
    linhasDasOutras.set(c.idAcao, c.linhas);
  });
  itens.sort((a, b) => b.metros - a.metros);
  return { itens, comparadas: base.length, linhasDasOutras };
}

/** Acrescenta ao resultado o aviso e o desenho das ações sobrepostas. */
export function aplicarSobreposicoes(
  resultado: ResultadoKml,
  comparacao: { itens: SobreposicaoNaBase[]; comparadas: number; linhasDasOutras: Map<string, Coord[][]> },
  toleranciaM: number
): void {
  resultado.sobreposicoesNaBase = { comparadas: comparacao.comparadas, toleranciaM, itens: comparacao.itens };
  if (comparacao.itens.length > 0) {
    const lista = comparacao.itens.slice(0, 5).map((i) => `${i.idAcao} (${i.metros.toLocaleString("pt-BR")} m)`).join(", ");
    resultado.alertas.unshift({
      nivel: "aviso",
      texto: `Este KML corre junto (a até ${toleranciaM} m) de trechos de ${comparacao.itens.length} outra(s) ação(ões) da base: ${lista}${comparacao.itens.length > 5 ? "…" : ""}. Confira possível duplicação.`,
    });
    resultado.mapa.outras = comparacao.itens.slice(0, 8).map((i) => ({
      idAcao: i.idAcao,
      linhas: (comparacao.linhasDasOutras.get(i.idAcao) ?? []).slice(0, 100).map((l) => {
        const passo = Math.max(1, Math.ceil(l.length / 300));
        return l.filter((_, k) => k % passo === 0 || k === l.length - 1).map(([x, y]) => [y, x] as [number, number]);
      }),
    }));
  } else if (comparacao.comparadas > 0) {
    resultado.alertas.push({ nivel: "info", texto: `Sem sobreposição com as ${comparacao.comparadas.toLocaleString("pt-BR")} ação(ões) da base de traçados (tolerância de ${toleranciaM} m).` });
  }
}

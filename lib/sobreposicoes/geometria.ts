// Geometria do CSV de sobreposições (colunas WKT do Mapa de Obras). Roda no navegador:
// o arquivo chega a 100+ MB porque o traçado de cada obra se repete em todas as
// linhas em que ela aparece. Aqui ele é separado, sem repetição, antes de subir.

import { parseCsvLinhas } from "@/lib/simo/parseCsv";

export const COLUNA_GEOM_SOBREPOSTA = "Geometria sobreposta (WKT)";
export const COLUNA_TRACADO = "Traçado completo da obra (WKT)";

/** Arredonda as coordenadas (5 casas, cerca de 1 m) para encolher o texto. */
export function arredondarWkt(wkt: string, casas = 5): string {
  return wkt.replace(/-?\d+\.\d+/g, (n) => String(Number(Number(n).toFixed(casas))));
}

/** LINESTRING / MULTILINESTRING em listas de [lat, lon] para o mapa. */
export function wktParaLinhas(wkt: string): [number, number][][] {
  const linhas: [number, number][][] = [];
  const grupos = wkt.match(/\(([^()]+)\)/g) ?? [];
  for (const g of grupos) {
    const pontos = g
      .slice(1, -1)
      .split(",")
      .map((par) => par.trim().split(/\s+/).map(Number))
      .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [p[1], p[0]] as [number, number]);
    if (pontos.length >= 2) linhas.push(pontos);
  }
  return linhas;
}

function campoCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export type GeometriaSeparada = {
  /** O mesmo CSV sem as colunas de geometria (vai para o importador de sempre). */
  csvLeve: string;
  geomPorLocal: Map<string, string[]>;
  tracadoPorObra: Map<string, string>;
};

export function separarGeometria(texto: string): GeometriaSeparada {
  const linhas = parseCsvLinhas(texto);
  if (linhas.length === 0) return { csvLeve: texto, geomPorLocal: new Map(), tracadoPorObra: new Map() };

  const cab = linhas[0].map((h) => h.trim());
  const iGeom = cab.indexOf(COLUNA_GEOM_SOBREPOSTA);
  const iTracado = cab.indexOf(COLUNA_TRACADO);
  const iChave = cab.indexOf("Chave do Local");
  const iId = cab.indexOf("ID da Ação");
  const geomPorLocal = new Map<string, string[]>();
  const tracadoPorObra = new Map<string, string>();
  if (iGeom === -1 && iTracado === -1) return { csvLeve: texto, geomPorLocal, tracadoPorObra };

  const manter = cab.map((_, i) => i).filter((i) => i !== iGeom && i !== iTracado);
  const saida: string[] = [manter.map((i) => campoCsv(cab[i])).join(";")];

  for (const l of linhas.slice(1)) {
    saida.push(manter.map((i) => campoCsv(l[i] ?? "")).join(";"));
    const chave = l[iChave]?.trim();
    const id = l[iId]?.trim();
    const geom = iGeom >= 0 ? l[iGeom]?.trim() : "";
    const tracado = iTracado >= 0 ? l[iTracado]?.trim() : "";
    if (chave && geom) {
      const lista = geomPorLocal.get(chave) ?? [];
      const g = arredondarWkt(geom);
      if (!lista.includes(g)) lista.push(g);
      geomPorLocal.set(chave, lista);
    }
    if (id && tracado && !tracadoPorObra.has(id)) tracadoPorObra.set(id, arredondarWkt(tracado));
  }

  return { csvLeve: saida.join("\n"), geomPorLocal, tracadoPorObra };
}

/** Divide em lotes de até ~limite caracteres de JSON (o servidor aceita até 4,5 MB por envio). */
export function emLotes<T>(itens: T[], limite = 2_500_000): T[][] {
  const lotes: T[][] = [];
  let atual: T[] = [];
  let tamanho = 0;
  for (const item of itens) {
    const t = JSON.stringify(item).length;
    if (atual.length > 0 && tamanho + t > limite) {
      lotes.push(atual);
      atual = [];
      tamanho = 0;
    }
    atual.push(item);
    tamanho += t;
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

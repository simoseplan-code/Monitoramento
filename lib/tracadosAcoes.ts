import type { SupabaseClient } from "@supabase/supabase-js";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import { geomExtraDe } from "@/lib/bairros/geometriaMapa";

export type Coord = [number, number]; // [lon, lat]
export type TracadoBruto = { linhas: Coord[][]; pontos: Coord[]; poligonos: Coord[][] };

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

/**
 * Traçado guardado de cada ação, sem simplificar: o do mapa de obras vale; o KML guardado completa o que o mapa não tem.
 * Ações sem nenhum traçado não entram no resultado. (Só o servidor chama: usa o acesso de administração.)
 */
export async function carregarTracadosBrutos(admin: SupabaseClient, ids: string[]): Promise<Map<string, TracadoBruto>> {
  const wktMapa = new Map<string, string>();
  const wktKml = new Map<string, string>();
  await Promise.all(
    emLotes(ids, 60).map(async (lote) => {
      const [a, b] = await Promise.all([
        admin.from("obras_tracado").select("id_acao, wkt").in("id_acao", lote),
        admin.from("kml_arquivos").select("id_acao, wkt").in("id_acao", lote).not("wkt", "is", null),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);
      for (const r of a.data ?? []) if (r.wkt) wktMapa.set(r.id_acao as string, r.wkt as string);
      for (const r of b.data ?? []) if (r.wkt) wktKml.set(r.id_acao as string, r.wkt as string);
    })
  );
  const extras = await geomExtraDe(admin, ids).catch(() => new Map());

  const saida = new Map<string, TracadoBruto>();
  for (const id of ids) {
    const wkt = wktMapa.get(id) ?? wktKml.get(id);
    const linhas = wkt ? wktParaLinhasLonLat(wkt) : [];
    const extra = extras.get(id);
    const pontos: Coord[] = (extra?.pontos ?? []).slice(0, 30);
    const poligonos: Coord[][] = (extra?.poligonos ?? []).slice(0, 10);
    if (linhas.length === 0 && pontos.length === 0 && poligonos.length === 0) continue;
    saida.set(id, { linhas, pontos, poligonos });
  }
  return saida;
}

/** Reduz uma linha a no máximo `max` pontos, mantendo o primeiro e o último. */
export function amostrarLinha(pts: Coord[], max: number): Coord[] {
  const passo = Math.max(1, Math.ceil(pts.length / max));
  const saida: Coord[] = [];
  for (let i = 0; i < pts.length; i += passo) saida.push(pts[i]);
  const ult = pts[pts.length - 1];
  const fim = saida[saida.length - 1];
  if (pts.length > 1 && (fim[0] !== ult[0] || fim[1] !== ult[1])) saida.push(ult);
  return saida;
}

export type FonteTracado = "kml" | "mapa" | "ambos";

/** De onde vem o traçado de cada ação (sem baixar o desenho): KML do SIMO, mapa de obras ou os dois. Sem traçado = fora do resultado. */
export async function fontesDoTracado(admin: SupabaseClient, ids: string[]): Promise<Map<string, FonteTracado>> {
  const kml = new Set<string>();
  const mapa = new Set<string>();
  await Promise.all(
    emLotes(ids, 200).map(async (lote) => {
      const [a, b, c] = await Promise.all([
        // KML guardado com alguma geometria: linhas, ou só pontos/polígonos (também é georreferenciada).
        admin.from("kml_arquivos").select("id_acao").in("id_acao", lote).or("wkt.not.is.null,qtd_pontos.gt.0,qtd_poligonos.gt.0"),
        admin.from("obras_tracado").select("id_acao").in("id_acao", lote),
        admin.from("obras_geom_extra").select("id_acao").in("id_acao", lote).or("pontos.not.is.null,poligonos.not.is.null"),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);
      for (const r of a.data ?? []) kml.add(r.id_acao as string);
      for (const r of b.data ?? []) mapa.add(r.id_acao as string);
      // Se a tabela de pontos e polígonos ainda não existe, só o traçado em linhas conta.
      for (const r of c.error ? [] : (c.data ?? [])) mapa.add(r.id_acao as string);
    })
  );
  const saida = new Map<string, FonteTracado>();
  for (const id of ids) {
    const k = kml.has(id);
    const m = mapa.has(id);
    if (k || m) saida.set(id, k && m ? "ambos" : k ? "kml" : "mapa");
  }
  return saida;
}

import type { SupabaseClient } from "@supabase/supabase-js";

type Coord = [number, number]; // [lon, lat]

// Os arquivos de pontos e de polígonos ficam ao lado do de linhas (mesma pasta, mesmo mapa).
const URL_LINHAS = process.env.OBRAS_LINHAS_URL || "https://pub-8891acbff66c47a0822bc6d565e97a2d.r2.dev/obras_linhas.geojson";
const URL_PONTOS = process.env.OBRAS_PONTOS_URL || URL_LINHAS.replace("obras_linhas", "obras_pontos");
const URL_POLIGONOS = process.env.OBRAS_POLIGONOS_URL || URL_LINHAS.replace("obras_linhas", "obras_poligonos");
const LIMITE_BYTES = 120 * 1024 * 1024;

type GeoJson = { features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[] };

async function baixarGeoJson(url: string): Promise<GeoJson> {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Não consegui baixar ${url} (${resp.status}).`);
  const tamanho = Number(resp.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_BYTES) throw new Error("Arquivo do mapa grande demais.");
  return (await resp.json()) as GeoJson;
}

const idDe = (p: Record<string, unknown> | null | undefined): string | null => {
  const v = p?.["ID da Ação"] ?? p?.["id_acao"];
  const s = v == null ? "" : String(v).trim();
  return /^\d{1,12}$/.test(s) ? s : null;
};

const arred = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Baixa os pontos e os polígonos que o mapa publica e guarda um registro por ação (obras_geom_extra).
 * Recusa o resultado se cair a menos da metade do que já existe (arquivo ruim) e nunca apaga por erro.
 */
export async function atualizarGeometriaDoMapa(admin: SupabaseClient): Promise<{ comPontos: number; comPoligonos: number; acoes: number }> {
  const [pontosGeo, poligonosGeo] = await Promise.all([baixarGeoJson(URL_PONTOS), baixarGeoJson(URL_POLIGONOS)]);

  const pontos = new Map<string, Coord[]>();
  for (const f of pontosGeo.features ?? []) {
    const id = idDe(f.properties);
    const c = f.geometry?.type === "Point" ? (f.geometry.coordinates as number[] | undefined) : undefined;
    if (!id || !c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const lista = pontos.get(id) ?? [];
    lista.push([arred(c[0]), arred(c[1])]);
    pontos.set(id, lista);
  }

  const poligonos = new Map<string, Coord[][]>();
  for (const f of poligonosGeo.features ?? []) {
    const id = idDe(f.properties);
    if (!id || !f.geometry) continue;
    // Polygon: [anel externo, ...furos]; MultiPolygon: lista de polígonos. Só o contorno externo importa.
    const aneis: number[][][] =
      f.geometry.type === "Polygon"
        ? [((f.geometry.coordinates as number[][][])[0] ?? [])]
        : f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][]).map((p) => p[0] ?? [])
          : [];
    for (const anel of aneis) {
      const pts = anel.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [arred(c[0]), arred(c[1])] as Coord);
      if (pts.length < 3) continue;
      const lista = poligonos.get(id) ?? [];
      lista.push(pts);
      poligonos.set(id, lista);
    }
  }

  const ids = Array.from(new Set([...pontos.keys(), ...poligonos.keys()]));
  const { count: existentes } = await admin.from("obras_geom_extra").select("id_acao", { count: "exact", head: true });
  if ((existentes ?? 0) > 0 && ids.length < (existentes ?? 0) * 0.5) {
    throw new Error(`O arquivo de pontos e polígonos veio com ${ids.length} ações (havia ${existentes}); mantive o que já estava guardado.`);
  }

  const agora = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200).map((id) => ({ id_acao: id, pontos: pontos.get(id) ?? null, poligonos: poligonos.get(id) ?? null, atualizado_em: agora }));
    const { error } = await admin.from("obras_geom_extra").upsert(lote, { onConflict: "id_acao" });
    if (error) throw new Error(`gravar obras_geom_extra: ${error.message}`);
  }
  // Ação que saiu do mapa deixa de ter pontos/polígonos guardados.
  const manter = new Set(ids);
  const { data: todas } = await admin.from("obras_geom_extra").select("id_acao");
  const sobrando = (todas ?? []).map((r) => r.id_acao as string).filter((id) => !manter.has(id));
  for (let i = 0; i < sobrando.length; i += 200) {
    await admin.from("obras_geom_extra").delete().in("id_acao", sobrando.slice(i, i + 200));
  }

  return { comPontos: pontos.size, comPoligonos: poligonos.size, acoes: ids.length };
}

export type GeomExtra = { pontos: Coord[] | null; poligonos: Coord[][] | null };

/** Pontos e polígonos do mapa de algumas ações, por ID. */
export async function geomExtraDe(admin: SupabaseClient, ids: string[]): Promise<Map<string, GeomExtra>> {
  const saida = new Map<string, GeomExtra>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin.from("obras_geom_extra").select("id_acao, pontos, poligonos").in("id_acao", ids.slice(i, i + 100));
    if (error) throw new Error(`ler obras_geom_extra: ${error.message}`);
    for (const r of data ?? []) saida.set(r.id_acao as string, { pontos: (r.pontos as Coord[] | null) ?? null, poligonos: (r.poligonos as Coord[][] | null) ?? null });
  }
  return saida;
}

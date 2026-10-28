import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerKml, textoDoArquivo } from "@/lib/kml/analisar";

type Coord = [number, number]; // [lon, lat]

export type PontosEContornos = { pontos: Coord[]; contornos: Coord[][] };

/** Pontos e contornos de polígonos do KML guardado de uma ação (vazio se não houver arquivo). */
export async function pontosEContornosDoKml(admin: SupabaseClient, idAcao: string): Promise<PontosEContornos> {
  const vazio: PontosEContornos = { pontos: [], contornos: [] };
  // Primeiro só os números (leve); o arquivo inteiro só é lido se tiver ponto ou polígono.
  const { data: resumo } = await admin.from("kml_arquivos").select("qtd_pontos, qtd_poligonos").eq("id_acao", idAcao).eq("situacao", "baixado").maybeSingle();
  if (!resumo || !(Number(resumo.qtd_pontos) > 0 || Number(resumo.qtd_poligonos) > 0)) return vazio;
  const { data } = await admin.from("kml_arquivos").select("kml_gzip_b64").eq("id_acao", idAcao).maybeSingle();
  if (!data?.kml_gzip_b64) return vazio;
  try {
    const xml = await textoDoArquivo(gunzipSync(Buffer.from(data.kml_gzip_b64 as string, "base64")));
    const { feicoes } = lerKml(xml);
    const saida: PontosEContornos = { pontos: [], contornos: [] };
    for (const f of feicoes) {
      if (f.tipo === "ponto" && f.coords[0]) saida.pontos.push([f.coords[0][0], f.coords[0][1]]);
      else if (f.tipo === "poligono" && f.coords.length >= 3) saida.contornos.push(f.coords.map((c) => [c[0], c[1]] as Coord));
    }
    return saida;
  } catch {
    return vazio;
  }
}

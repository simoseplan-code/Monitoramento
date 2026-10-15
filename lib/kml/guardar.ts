import { gunzipSync, gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumoGeometria } from "@/lib/kml/analisar";
import { linhasParaWkt } from "@/lib/kml/base";

// Arquivos KML guardados (tabela kml_arquivos): o KML de cada ação, baixado do SIMO uma vez.
// Estas funções usam o cliente do SERVIDOR (service_role): quem grava é sempre o painel.

const LIMITE_GUARDAR_BYTES = 25 * 1024 * 1024;

export type KmlGuardado = { buffer: Buffer; nome: string; baixadoEm: string | null };

/** Guarda (ou troca) o KML baixado de uma ação, com o resumo do traçado para comparação. Devolve false se não coube. */
export async function guardarKml(admin: SupabaseClient, idAcao: string, buffer: Buffer, nome: string, usuarioId: string | null): Promise<boolean> {
  if (buffer.length > LIMITE_GUARDAR_BYTES) {
    await registrarFalha(admin, idAcao, "erro", `KML de ${(buffer.length / 1048576).toFixed(1)} MB: grande demais para guardar (limite de 25 MB).`);
    return false;
  }
  const g = await resumoGeometria(buffer);

  // Traçado para comparar com outras ações: só as linhas, no máximo ~30 mil pontos.
  let linhas = g.linhas;
  const pontos = linhas.reduce((s, l) => s + l.length, 0);
  if (pontos > 30000) {
    const passo = Math.ceil(pontos / 30000);
    linhas = linhas.map((l) => l.filter((_, k) => k % passo === 0 || k === l.length - 1)).filter((l) => l.length >= 2);
  }

  const agora = new Date().toISOString();
  const { error } = await admin.from("kml_arquivos").upsert(
    {
      id_acao: idAcao,
      situacao: "baixado",
      nome_arquivo: nome,
      tamanho_bytes: buffer.length,
      kml_gzip_b64: gzipSync(buffer).toString("base64"),
      wkt: linhas.length > 0 ? linhasParaWkt(linhas) : null,
      extensao_km: g.extensaoKm,
      qtd_pontos: g.qtdPontos,
      qtd_linhas: g.qtdLinhas,
      qtd_poligonos: g.qtdPoligonos,
      min_lon: g.caixa?.oeste ?? null,
      min_lat: g.caixa?.sul ?? null,
      max_lon: g.caixa?.leste ?? null,
      max_lat: g.caixa?.norte ?? null,
      mensagem: null,
      verificado_em: agora,
      baixado_em: agora,
      baixado_por: usuarioId,
    },
    { onConflict: "id_acao" }
  );
  if (error) throw new Error(`Falha ao guardar o KML da ação ${idAcao}: ${error.message}`);
  return true;
}

/**
 * Registra que o SIMO não tem KML (ou deu erro) para a ação. Nunca apaga um KML que já está
 * guardado: se a ação já tem arquivo, a falha só vira aviso na própria tela de quem tentou.
 */
export async function registrarFalha(admin: SupabaseClient, idAcao: string, situacao: "sem_kml" | "erro", mensagem: string): Promise<void> {
  const { data } = await admin.from("kml_arquivos").select("situacao").eq("id_acao", idAcao).maybeSingle();
  if (data?.situacao === "baixado") return;
  await admin.from("kml_arquivos").upsert(
    { id_acao: idAcao, situacao, mensagem: mensagem.slice(0, 300), verificado_em: new Date().toISOString() },
    { onConflict: "id_acao" }
  );
}

/** O KML guardado de uma ação (ou null se ainda não foi baixado). */
export async function lerKmlGuardado(admin: SupabaseClient, idAcao: string): Promise<KmlGuardado | null> {
  const { data } = await admin
    .from("kml_arquivos")
    .select("nome_arquivo, kml_gzip_b64, baixado_em")
    .eq("id_acao", idAcao)
    .eq("situacao", "baixado")
    .maybeSingle();
  if (!data?.kml_gzip_b64) return null;
  try {
    return { buffer: gunzipSync(Buffer.from(data.kml_gzip_b64, "base64")), nome: data.nome_arquivo ?? `${idAcao}.kml`, baixadoEm: data.baixado_em };
  } catch {
    return null;
  }
}

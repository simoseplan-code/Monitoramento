import type { SupabaseClient } from "@supabase/supabase-js";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import type { FeicaoLinha } from "@/lib/sobreposicoes/detectar";

/**
 * Traçados dos KMLs guardados (kml_arquivos) em formato de feição, para a detecção de
 * sobreposição considerar também as ações que ainda NÃO estão no arquivo do mapa (ex.: ação
 * nova ou em execução cujo KML já foi baixado). Regra de conflito: se o ID já tem linhas no
 * mapa, o do mapa vale e o KML guardado é ignorado.
 */
export async function feicoesDeKmlGuardado(admin: SupabaseClient, idsNoMapa: Set<string>): Promise<{ feicoes: FeicaoLinha[]; acoes: number }> {
  const feicoes: FeicaoLinha[] = [];
  const idsUsados = new Set<string>();

  for (let de = 0; ; de += 100) {
    const { data, error } = await admin
      .from("kml_arquivos")
      .select("id_acao, wkt")
      .eq("situacao", "baixado")
      .not("wkt", "is", null)
      .order("id_acao")
      .range(de, de + 99);
    if (error) throw new Error(`ler KMLs guardados: ${error.message}`);
    const lote = (data ?? []).filter((r) => !idsNoMapa.has(String(r.id_acao)));

    // Nome, órgão, status, data e contrato da ação (base sincronizada).
    const ids = lote.map((r) => r.id_acao as string);
    const { data: obras } = ids.length
      ? await admin.from("obras").select("id_acao, nome_acao, orgao, status, data_criacao, numero_automatico, numero_siafe").in("id_acao", ids)
      : { data: [] as { id_acao: string; nome_acao: string; orgao: string | null; status: string | null; data_criacao: string | null; numero_automatico: string | null; numero_siafe: string | null }[] };
    const porId = new Map((obras ?? []).map((o) => [o.id_acao, o]));

    for (const r of lote) {
      const o = porId.get(r.id_acao);
      if (!o) continue; // ação que não existe mais na base
      for (const linha of wktParaLinhasLonLat(r.wkt as string)) {
        feicoes.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: linha },
          properties: {
            "ID da Ação": r.id_acao,
            "Nome da Ação": o.nome_acao,
            "Orgão da Açao": o.orgao,
            Status: o.status,
            "Data Inicio": o.data_criacao,
            "Número do Contrato no SIAFE": o.numero_automatico || o.numero_siafe,
          },
        });
        idsUsados.add(r.id_acao as string);
      }
    }
    if (!data || data.length < 100) break;
  }
  return { feicoes, acoes: idsUsados.size };
}

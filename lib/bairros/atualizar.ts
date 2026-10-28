import type { SupabaseClient } from "@supabase/supabase-js";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import { bairrosDoTracado, carregarBairros } from "@/lib/bairros/calcular";
import { pontosEContornosDoKml } from "@/lib/bairros/kmlGuardado";
import { atualizarGeometriaDoMapa, geomExtraDe } from "@/lib/bairros/geometriaMapa";

export type ResumoBairros = { processadas: number; comBairro: number; semBairro: number; terminou: boolean; pontosPoligonosDoMapa: string };

type Pendente = { id_acao: string; fonte: "sobreposicoes" | "kml" | "mapa"; assinatura: string };

/**
 * Calcula (e guarda) os bairros das ações cujo traçado é novo ou mudou. Não refaz o que já está
 * calculado: o SQL só devolve a ação cuja assinatura (md5 do traçado) é diferente da guardada.
 * Roda em lotes até acabar o tempo dado.
 */
export async function atualizarBairros(admin: SupabaseClient, opcoes: { limiteMs: number; baixarMapa?: boolean }): Promise<ResumoBairros> {
  const inicio = Date.now();
  const bairros = await carregarBairros();
  const resumo: ResumoBairros = { processadas: 0, comBairro: 0, semBairro: 0, terminou: false, pontosPoligonosDoMapa: "" };

  // Pontos e polígonos que o mapa publica: atualiza antes de calcular. Se falhar (arquivo fora do ar),
  // segue com o que já estava guardado.
  if (opcoes.baixarMapa !== false) {
    try {
      const g = await atualizarGeometriaDoMapa(admin);
      resumo.pontosPoligonosDoMapa = `${g.comPontos} ações com pontos, ${g.comPoligonos} com polígonos`;
    } catch (e) {
      resumo.pontosPoligonosDoMapa = `não atualizados: ${e instanceof Error ? e.message : "erro"}`;
    }
  }

  while (Date.now() - inicio < opcoes.limiteMs) {
    const { data, error } = await admin.rpc("bairros_pendentes", { limite: 60 });
    if (error) throw new Error(`bairros_pendentes: ${error.message}`);
    const pendentes = (data ?? []) as Pendente[];
    if (pendentes.length === 0) {
      resumo.terminou = true;
      break;
    }

    // Traçado de cada uma, da tabela certa.
    const wkts = new Map<string, string>();
    for (const [fonte, tabela] of [["sobreposicoes", "obras_tracado"], ["kml", "kml_arquivos"]] as const) {
      const ids = pendentes.filter((p) => p.fonte === fonte).map((p) => p.id_acao);
      if (ids.length === 0) continue;
      const { data: linhas, error: erroLeitura } = await admin.from(tabela).select("id_acao, wkt").in("id_acao", ids);
      if (erroLeitura) throw new Error(`ler ${tabela}: ${erroLeitura.message}`);
      for (const l of linhas ?? []) if (l.wkt) wkts.set(l.id_acao as string, l.wkt as string);
    }

    const extrasDoMapa = await geomExtraDe(admin, pendentes.map((p) => p.id_acao));
    const calculos: { id_acao: string; fonte: string; assinatura: string; extensao_m: number; metros_fora: number; qtd_bairros: number; pontos: number; pontos_fora: number; calculado_em: string }[] = [];
    const itens: { id_acao: string; municipio: string; bairro: string; metros: number; pct: number; pontos: number }[] = [];
    const agora = new Date().toISOString();

    for (const p of pendentes) {
      const wkt = wkts.get(p.id_acao);
      // Linhas do traçado + pontos e polígonos. Os do mapa valem; o KML guardado só completa o que o mapa não tem.
      const doMapa = extrasDoMapa.get(p.id_acao);
      const doKml = doMapa?.pontos && doMapa?.poligonos ? { pontos: [], contornos: [] } : await pontosEContornosDoKml(admin, p.id_acao);
      const pontos = doMapa?.pontos ?? doKml.pontos;
      const contornos = doMapa?.poligonos ?? doKml.contornos;
      const linhas = [...(wkt ? wktParaLinhasLonLat(wkt) : []), ...contornos];
      const r = bairrosDoTracado(linhas, bairros, pontos);
      calculos.push({ id_acao: p.id_acao, fonte: p.fonte, assinatura: p.assinatura, extensao_m: Math.round(r.extensaoM), metros_fora: r.metrosFora, qtd_bairros: r.bairros.length, pontos: r.pontos, pontos_fora: r.pontosFora, calculado_em: agora });
      for (const b of r.bairros) itens.push({ id_acao: p.id_acao, municipio: b.municipio, bairro: b.bairro, metros: b.metros, pct: b.pct, pontos: b.pontos });
      resumo.processadas++;
      if (r.bairros.length > 0) resumo.comBairro++;
      else resumo.semBairro++;
    }

    const ids = pendentes.map((p) => p.id_acao);
    const { error: e1 } = await admin.from("acao_bairros").delete().in("id_acao", ids);
    if (e1) throw new Error(`limpar acao_bairros: ${e1.message}`);
    if (itens.length > 0) {
      const { error: e2 } = await admin.from("acao_bairros").insert(itens);
      if (e2) throw new Error(`gravar acao_bairros: ${e2.message}`);
    }
    // O cálculo é gravado por último: se algo falhar antes, a ação continua "pendente" e é refeita.
    const { error: e3 } = await admin.from("acao_bairros_calculo").upsert(calculos, { onConflict: "id_acao" });
    if (e3) throw new Error(`gravar acao_bairros_calculo: ${e3.message}`);
  }
  return resumo;
}

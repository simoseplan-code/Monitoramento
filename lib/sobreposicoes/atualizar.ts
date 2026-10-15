import type { SupabaseClient } from "@supabase/supabase-js";
import { detectarSobreposicoes, TOLERANCIA_PADRAO_M, type FeicaoLinha } from "@/lib/sobreposicoes/detectar";
import { aplicarLocais, ErroImportacao, type ResumoImportacao } from "@/lib/sobreposicoes/importar";
import { feicoesDeKmlGuardado } from "@/lib/sobreposicoes/kmlGuardados";

// Arquivo de linhas das obras que o mapa publica todo dia (o mesmo que o mapa usa).
const URL_LINHAS = process.env.OBRAS_LINHAS_URL || "https://pub-8891acbff66c47a0822bc6d565e97a2d.r2.dev/obras_linhas.geojson";
const LIMITE_BYTES = 120 * 1024 * 1024;

export class ErroAtualizacao extends Error {
  constructor(
    mensagem: string,
    readonly status: number = 500
  ) {
    super(mensagem);
  }
}

export type ResultadoAtualizacao = ResumoImportacao & {
  simulacao: boolean;
  toleranciaM: number;
  acoesComTracado: number;
  acoesDeKml: number;
};

function caixaDoWkt(wkt: string): { min_lon: number; min_lat: number; max_lon: number; max_lat: number } | null {
  let x0 = 181,
    y0 = 91,
    x1 = -181,
    y1 = -91;
  for (const m of wkt.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    const x = Number(m[1]),
      y = Number(m[2]);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 > 180 ? null : { min_lon: x0, min_lat: y0, max_lon: x1, max_lat: y1 };
}

/**
 * Atualiza as Sobreposições direto dos traçados do mapa (mais os KMLs guardados das ações que
 * o mapa ainda não tem). Serve ao botão da tela e à rotina diária.
 * REGRA PRINCIPAL: o que já foi analisado nunca é apagado nem sobrescrito (ver importar.ts).
 * `automatico` liga travas extras para rodar sem ninguém olhando: se o resultado cair muito
 * em relação ao que já existe, não aplica nada.
 */
export async function atualizarSobreposicoes(
  admin: SupabaseClient,
  opcoes: { simular?: boolean; automatico?: boolean } = {}
): Promise<ResultadoAtualizacao> {
  const simular = opcoes.simular === true;

  const resp = await fetch(URL_LINHAS, { signal: AbortSignal.timeout(120_000), cache: "no-store" });
  if (!resp.ok) throw new ErroAtualizacao(`Não consegui baixar os traçados do mapa (HTTP ${resp.status}).`, 502);
  if (Number(resp.headers.get("content-length") ?? 0) > LIMITE_BYTES) throw new ErroAtualizacao("O arquivo de traçados está grande demais.", 502);
  const geo = (await resp.json()) as { features?: FeicaoLinha[] };
  if (!Array.isArray(geo.features) || geo.features.length === 0) throw new ErroAtualizacao("O arquivo de traçados veio vazio.", 502);

  // Ações com KML guardado que ainda não estão no mapa também entram. Se o ID já está no mapa, o do mapa vale.
  const idsNoMapa = new Set<string>();
  for (const f of geo.features) {
    const id = f.properties?.["ID da Ação"];
    if (id != null && f.geometry) idsNoMapa.add(String(id));
  }
  const extras = await feicoesDeKmlGuardado(admin, idsNoMapa).catch((e) => {
    // Falha ao ler os KMLs guardados não impede a atualização pelo mapa.
    console.error("atualizar sobreposicoes (kml guardados):", e instanceof Error ? e.message : e);
    return { feicoes: [] as FeicaoLinha[], acoes: 0 };
  });

  const det = detectarSobreposicoes([...geo.features, ...extras.feicoes], TOLERANCIA_PADRAO_M);

  // Trava de segurança: uma detecção que "achou quase nada" quase sempre é arquivo ruim, e
  // aplicar isso removeria locais por engano.
  if (det.locais.length < 100) {
    const e = det.estatisticas;
    console.error("atualizar sobreposicoes: detecção abaixo do normal", e, "features", geo.features.length);
    throw new ErroAtualizacao(
      `A detecção encontrou só ${det.locais.length} local(is), muito abaixo do normal. Nada foi alterado. ` +
        `(linhas lidas: ${geo.features.length}, consideradas: ${e.linhasConsideradas}, pares comparados: ${e.paresComparados}, erros no cálculo: ${e.errosNoCalculo}${e.primeiroErro ? `, primeiro erro: ${e.primeiroErro}` : ""})`,
      422
    );
  }

  // Rotina automática: sem ninguém olhando a prévia, recusa uma queda brusca.
  if (opcoes.automatico) {
    const { count } = await admin.from("sobreposicoes").select("chave_local", { count: "exact", head: true });
    if ((count ?? 0) > 200 && det.locais.length < (count ?? 0) * 0.5) {
      throw new ErroAtualizacao(
        `A detecção achou ${det.locais.length} locais contra ${count} já cadastrados (queda de mais da metade). Nada foi alterado; confira o arquivo do mapa.`,
        422
      );
    }
  }

  const resumo = await aplicarLocais(admin, det.locais, simular);
  if (simular) {
    return { ...resumo, simulacao: true, toleranciaM: TOLERANCIA_PADRAO_M, acoesComTracado: det.tracadoPorObra.size, acoesDeKml: extras.acoes };
  }

  // Desenho: trecho sobreposto de cada local e traçado completo de cada ação do mapa.
  const locais = Array.from(det.geomPorLocal, ([chave, geoms]) => ({ chave, geoms }));
  for (let i = 0; i < locais.length; i += 300) {
    const { error } = await admin.rpc("sobreposicoes_salvar_geometria", { dados: locais.slice(i, i + 300) });
    if (error) throw new ErroImportacao(`Locais atualizados, mas falhou ao salvar o desenho: ${error.message}`);
  }
  const agora = new Date().toISOString();
  // Só o traçado de quem está no mapa vai para obras_tracado; o das ações só com KML guardado fica em kml_arquivos.
  const tracados = Array.from(det.tracadoPorObra)
    .filter(([id]) => idsNoMapa.has(id))
    .map(([id, wkt]) => ({ id_acao: id, wkt, atualizado_em: agora, ...(caixaDoWkt(wkt) ?? {}) }));
  for (let i = 0; i < tracados.length; i += 100) {
    const { error } = await admin.from("obras_tracado").upsert(tracados.slice(i, i + 100), { onConflict: "id_acao" });
    if (error) throw new ErroImportacao(`Locais atualizados, mas falhou ao salvar os traçados: ${error.message}`);
  }

  return { ...resumo, simulacao: false, toleranciaM: TOLERANCIA_PADRAO_M, acoesComTracado: tracados.length, acoesDeKml: extras.acoes };
}

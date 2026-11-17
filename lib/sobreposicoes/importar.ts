import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ObraNoLocal, SobreposicaoImportada } from "@/lib/sobreposicoes/parseCsv";

export class ErroImportacao extends Error {}

export type ResumoImportacao = {
  total: number;
  novos: number;
  jaExistiam: number;
  analiseReaproveitada: number;
  removidos: number;
  analisadosMantidos: number;
};

// Combinação estável dos IDs das obras de um local, ordenados, ao contrário de "Chave do Local"
// (que inclui coordenada e pode mudar entre exportações). Serve para reconhecer "essa
// combinação já foi analisada antes" mesmo quando a chave exata é nova.
export function chaveObras(obras: ObraNoLocal[]): string {
  return obras
    .map((o) => o.id)
    .filter((id): id is string => !!id)
    .sort()
    .join(",");
}

/**
 * Aplica a lista de locais detectados (do CSV ou da detecção direta) na tabela de sobreposições.
 * REGRA PRINCIPAL: o que já foi analisado nunca é apagado nem sobrescrito. Locais novos entram
 * pendentes; o que não aparece mais e nunca foi analisado sai; análise de uma combinação de obras
 * que voltou com outra chave muda para a chave nova.
 * Com simular=true só conta o que aconteceria, sem gravar nada.
 */
export async function aplicarLocais(supabase: SupabaseClient, locais: SobreposicaoImportada[], simular = false): Promise<ResumoImportacao> {
  // Tudo o que já está cadastrado (poucos milhares de linhas, lido em páginas):
  // consultar pelas chaves do CSV estourava o tamanho da URL com milhares de locais.
  type Existente = {
    chave_local: string;
    chave_obras: string | null;
    status: string;
    observacao: string | null;
    responsavel_id: string | null;
    revisado_por: string | null;
    revisado_em: string | null;
    solucionado_por: string | null;
    solucionado_em: string | null;
    solucao: string | null;
    atualizado_em: string | null;
  };
  const existentes: Existente[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("sobreposicoes")
      .select("chave_local, chave_obras, status, observacao, responsavel_id, revisado_por, revisado_em, solucionado_por, solucionado_em, solucao, atualizado_em")
      .order("chave_local")
      .range(de, de + 999);
    if (error) {
      console.error("importar sobreposicoes (leitura):", error);
      throw new ErroImportacao("Falha ao ler as sobreposições atuais.");
    }
    existentes.push(...((data ?? []) as Existente[]));
    if (!data || data.length < 1000) break;
  }

  const noCsv = new Set(locais.map((l) => l.chave_local));
  const jaExistiam = new Set(existentes.map((r) => r.chave_local).filter((c) => noCsv.has(c)));
  const teveAnalise = (r: Existente) => r.status !== "pendente" || !!r.responsavel_id || !!r.observacao?.trim();

  // A análise vale para o PAR de obras (todos os trechos juntos). Para cada combinação de obras, o modelo é a
  // análise mais recente que já existe (de qualquer trecho, mesmo um que sumiu do CSV): trecho novo ou ainda
  // pendente do mesmo par recebe a mesma decisão, para o par nunca ser analisado duas vezes.
  const modeloPorObras = new Map<string, Existente>();
  for (const r of existentes) {
    if (!r.chave_obras || !teveAnalise(r)) continue;
    const atual = modeloPorObras.get(r.chave_obras);
    if (!atual || (r.atualizado_em ?? "") > (atual.atualizado_em ?? "")) modeloPorObras.set(r.chave_obras, r);
  }
  const camposAnalise = (m: Existente) => ({
    status: m.status,
    observacao: m.observacao,
    responsavel_id: m.responsavel_id,
    revisado_por: m.revisado_por,
    revisado_em: m.revisado_em,
    solucionado_por: m.solucionado_por,
    solucionado_em: m.solucionado_em,
    solucao: m.solucao,
  });
  // Combinações de obras que continuam aparecendo no CSV novo.
  const obrasNoCsv = new Set(locais.map((l) => chaveObras(l.obras)).filter(Boolean));

  const camposBase = (l: (typeof locais)[number]) => ({
    chave_local: l.chave_local,
    chave_obras: chaveObras(l.obras) || null,
    obras: l.obras,
    qtd_obras: l.qtd_obras,
    extensao_m: l.extensao_m,
    tolerancia_m: l.tolerancia_m,
    qtd_segmentos: l.qtd_segmentos,
    lat_inicio: l.lat_inicio,
    lon_inicio: l.lon_inicio,
    lat_fim: l.lat_fim,
    lon_fim: l.lon_fim,
    atualizado_em: new Date().toISOString(),
  });

  const realmenteNovos = locais.filter((l) => !jaExistiam.has(l.chave_local));
  // Trechos que já existiam, ainda pendentes, mas cujo par já foi analisado: herdam a análise.
  const herdamExistentes = existentes.filter((r) => noCsv.has(r.chave_local) && !teveAnalise(r) && r.chave_obras && modeloPorObras.has(r.chave_obras));
  const herdamNovos = realmenteNovos.filter((l) => modeloPorObras.has(chaveObras(l.obras)));

  // Trechos antigos que sumiram do CSV: os sem análise saem; os analisados só saem se o par continua no CSV
  // (a análise já foi passada adiante acima). Se o par inteiro sumiu, a análise fica guardada como sempre.
  const remover = existentes.filter((r) => !noCsv.has(r.chave_local) && !teveAnalise(r)).map((r) => r.chave_local);
  const removerAnalisados = existentes
    .filter((r) => !noCsv.has(r.chave_local) && teveAnalise(r) && r.chave_obras && obrasNoCsv.has(r.chave_obras))
    .map((r) => r.chave_local);
  const mantidos = existentes.filter((r) => !noCsv.has(r.chave_local) && teveAnalise(r)).length - removerAnalisados.length;
  const resumo: ResumoImportacao = {
    total: locais.length,
    novos: realmenteNovos.length - herdamNovos.length,
    jaExistiam: jaExistiam.size,
    analiseReaproveitada: herdamNovos.length + herdamExistentes.length,
    removidos: remover.length + removerAnalisados.length,
    analisadosMantidos: mantidos,
  };
  // Simulação: mostra o que aconteceria, sem gravar nada.
  if (simular) return resumo;

  const admin = createAdminClient();
  const erros: string[] = [];

  // 2) Locais que já existiam com a mesma chave: só os dados do mapa são atualizados
  //    (status/revisão nunca entram aqui, então a decisão nunca é sobrescrita).
  const linhasExistentes = locais.filter((l) => jaExistiam.has(l.chave_local)).map(camposBase);
  for (let i = 0; i < linhasExistentes.length; i += 500) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasExistentes.slice(i, i + 500), { onConflict: "chave_local" });
    if (error) erros.push(`gravar locais: ${error.message}`);
  }

  // 2b) Trechos já cadastrados e ainda pendentes cujo par já foi analisado: recebem a análise do par.
  for (const r of herdamExistentes) {
    const { error } = await admin.from("sobreposicoes").update(camposAnalise(modeloPorObras.get(r.chave_obras!)!)).eq("chave_local", r.chave_local);
    if (error) erros.push(`herdar análise: ${error.message}`);
  }

  // 3) Locais novos entram pendentes, ou já com a análise do par (se ele foi analisado antes).
  const linhasNovas = realmenteNovos.map((l) => {
    const modelo = modeloPorObras.get(chaveObras(l.obras));
    return modelo ? { ...camposBase(l), ...camposAnalise(modelo) } : camposBase(l);
  });
  for (let i = 0; i < linhasNovas.length; i += 500) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasNovas.slice(i, i + 500), { onConflict: "chave_local" });
    if (error) erros.push(`gravar locais: ${error.message}`);
  }

  if (erros.length > 0) {
    console.error("importar sobreposicoes:", erros);
    // Tela só de admin/chefe: mostra o motivo para dar para corrigir sem abrir o log da Vercel.
    throw new ErroImportacao(`Falha ao salvar no banco: ${erros[0]}`);
  }

  // 4) Substituição: o que não veio na lista nova e nunca foi analisado sai.
  //    Quem já teve análise (decisão, responsável ou observação) FICA, a não ser que o mesmo par de obras
  //    continue no CSV (aí a análise já foi passada para o trecho novo acima).
  for (let i = 0; i < removerAnalisados.length; i += 200) {
    const { error } = await admin.from("sobreposicoes").delete().in("chave_local", removerAnalisados.slice(i, i + 200));
    if (error) {
      console.error("importar sobreposicoes (remoção de trechos antigos do par):", error);
      throw new ErroImportacao("Locais importados, mas falhou ao remover trechos antigos. Atualize de novo.");
    }
  }
  for (let i = 0; i < remover.length; i += 200) {
    const { error } = await admin
      .from("sobreposicoes")
      .delete()
      .in("chave_local", remover.slice(i, i + 200))
      // Rede de segurança: só apaga o que está pendente, sem responsável, sem observação e sem solução.
      .eq("status", "pendente")
      .is("responsavel_id", null)
      .is("observacao", null)
      .is("solucao", null);
    if (error) {
      console.error("importar sobreposicoes (remoção):", error);
      throw new ErroImportacao("Locais importados, mas falhou ao remover os antigos. Atualize de novo.");
    }
  }

  // Recalcula órgãos/anos/tipologias/situação de cada local (é o que os filtros usam).
  const { error: erroDerivados } = await admin.rpc("sobreposicoes_atualizar_derivados");
  if (erroDerivados) console.error("importar sobreposicoes (derivados):", erroDerivados);

  return resumo;
}

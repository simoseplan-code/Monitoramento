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
  };
  const existentes: Existente[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("sobreposicoes")
      .select("chave_local, chave_obras, status, observacao, responsavel_id")
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

  // Locais analisados que não vêm no CSV novo, por combinação de obras: se a mesma
  // combinação aparece no CSV com outra chave (ex.: outra tolerância ou coordenada
  // arredondada), a análise MUDA para a chave nova, sem duplicar o local.
  const analisadoForaDoCsv = new Map<string, Existente>();
  for (const r of existentes) {
    if (!noCsv.has(r.chave_local) && teveAnalise(r) && r.chave_obras && !analisadoForaDoCsv.has(r.chave_obras)) {
      analisadoForaDoCsv.set(r.chave_obras, r);
    }
  }

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

  const locaisNovos = locais.filter((l) => !jaExistiam.has(l.chave_local));
  const reaproveitados: { antiga: string; novo: (typeof locais)[number] }[] = [];
  const realmenteNovos: (typeof locais)[number][] = [];
  for (const l of locaisNovos) {
    const combinacao = chaveObras(l.obras);
    const antigo = combinacao ? analisadoForaDoCsv.get(combinacao) : undefined;
    if (antigo) {
      analisadoForaDoCsv.delete(combinacao);
      reaproveitados.push({ antiga: antigo.chave_local, novo: l });
    } else {
      realmenteNovos.push(l);
    }
  }

  const remover = existentes
    .filter((r) => !noCsv.has(r.chave_local) && !teveAnalise(r))
    .map((r) => r.chave_local);
  const mantidos = existentes.filter((r) => !noCsv.has(r.chave_local) && teveAnalise(r)).length - reaproveitados.length;
  const resumo: ResumoImportacao = {
    total: locais.length,
    novos: realmenteNovos.length,
    jaExistiam: jaExistiam.size,
    analiseReaproveitada: reaproveitados.length,
    removidos: remover.length,
    analisadosMantidos: mantidos,
  };
  // Simulação: mostra o que aconteceria, sem gravar nada.
  if (simular) return resumo;

  const admin = createAdminClient();
  const erros: string[] = [];

  // 1) Análises que mudam de chave: atualiza a linha antiga (status, responsável,
  //    observação e solução ficam como estão; só a chave e os dados do mapa mudam).
  for (const r of reaproveitados) {
    const { error } = await admin.from("sobreposicoes").update(camposBase(r.novo)).eq("chave_local", r.antiga);
    if (error) erros.push(`trocar chave: ${error.message}`);
  }

  // 2) Locais que já existiam com a mesma chave: só os dados do mapa são atualizados
  //    (status/revisão nunca entram aqui, então a decisão nunca é sobrescrita).
  const linhasExistentes = locais.filter((l) => jaExistiam.has(l.chave_local)).map(camposBase);
  for (let i = 0; i < linhasExistentes.length; i += 500) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasExistentes.slice(i, i + 500), { onConflict: "chave_local" });
    if (error) erros.push(`gravar locais: ${error.message}`);
  }

  // 3) Locais novos entram como pendentes.
  const linhasNovas = realmenteNovos.map(camposBase);
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
  //    Quem já teve análise (decisão, responsável ou observação) FICA.
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

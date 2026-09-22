import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras, type ObraRow } from "@/lib/simo/parseCsv";
import { sugerirUnidadeQuantidade, paraTextoBR } from "@/lib/unidadeQuantidade/sugestao";
import type { SupabaseClient } from "@supabase/supabase-js";

const TAMANHO_LOTE = 1000;

export async function executarSyncSimo(): Promise<{ linhas: number }> {
  const admin = createAdminClient();

  try {
    const cookie = await loginSimo();
    await prepararRelatorioSimo(cookie);
    const csvText = await baixarCsvSimo(cookie);
    const obras = csvParaObras(csvText);

    if (obras.length === 0) {
      throw new Error("O SIMO retornou 0 linhas — provavelmente algo mudou no relatório. Sync abortado sem apagar dados.");
    }

    // Um único carimbo de tempo pra toda a execução: cada linha gravada
    // agora leva esse valor, então dá pra achar as que "sumiram" do
    // relatório do SIMO comparando o carimbo, em vez de montar uma
    // lista gigante de IDs numa cláusula NOT IN (o que quebra/estoura
    // com milhares de linhas).
    const syncIniciadoEm = new Date().toISOString();

    const lotes: (typeof obras)[] = [];
    for (let i = 0; i < obras.length; i += TAMANHO_LOTE) {
      lotes.push(obras.slice(i, i + TAMANHO_LOTE));
    }

    const resultados = await Promise.all(
      lotes.map((lote) =>
        admin.from("obras").upsert(
          lote.map((o) => ({ ...o, atualizado_em: syncIniciadoEm })),
          { onConflict: "id_acao" }
        )
      )
    );
    const erroLote = resultados.find((r) => r.error);
    if (erroLote?.error) throw new Error(`Falha ao gravar lote no Supabase: ${erroLote.error.message}`);

    // Ações que existiam antes desse carimbo e não foram tocadas nesta
    // execução saíram do relatório do SIMO (encerradas/excluídas lá).
    const { error: erroDelete } = await admin.from("obras").delete().lt("atualizado_em", syncIniciadoEm);
    if (erroDelete) throw new Error(`Falha ao remover ações obsoletas: ${erroDelete.message}`);

    await calcularSugestoesUnidade(admin, obras, syncIniciadoEm);

    const vinculadas = obras.filter((o) => !!o.numero_automatico).length;
    const pendentes = obras.filter((o) => !o.numero_automatico && !!o.numero_siafe).length;
    const dadoIncorreto = obras.filter((o) => o.numero_siafe && !/^\d{8}$/.test(o.numero_siafe)).length;

    await admin.from("obras_historico").insert({
      total: obras.length,
      vinculadas,
      pendentes,
      dado_incorreto: dadoIncorreto,
    });

    await admin.from("sync_log").insert({
      sucesso: true,
      linhas_processadas: obras.length,
      mensagem: `OK: ${obras.length} ações sincronizadas.`,
    });

    return { linhas: obras.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await admin.from("sync_log").insert({ sucesso: false, mensagem });
    throw new Error(mensagem);
  }
}

type SugestaoExistente = {
  id_acao: string;
  unidade_sugerida: string;
  quantidade_sugerida: string | null;
  aprovado: boolean;
  aprovado_por: string | null;
  aprovado_em: string | null;
  aplicado_em: string | null;
  aplicado_com_sucesso: boolean | null;
};

// Recalcula, pra toda a base, quais ações têm Unidade de Medida vazia ou
// divergente da sugestão do motor (lib/unidadeQuantidade/sugestao.ts), e
// persiste isso em obras_unidade_sugestao — a tela de revisão só faz
// SELECT paginado nessa tabela, nunca recalcula em cima da base inteira
// a cada carregamento (mesmo motivo de performance que levou o dashboard
// e Novas Ações a usarem RPC em vez de baixar tudo pro Next.js).
async function calcularSugestoesUnidade(admin: SupabaseClient, obras: ObraRow[], syncIniciadoEm: string): Promise<void> {
  const precisamSugestao: { obra: ObraRow; unidadeAtualVazia: boolean }[] = [];

  for (const obra of obras) {
    const sugestao = sugerirUnidadeQuantidade({ nome: obra.nome_acao, descricao: obra.descricao_acao, tipologia: obra.tipologia });
    if (!sugestao) continue;

    const unidadeAtual = (obra.unidade_medida || "").trim();
    const vazio = unidadeAtual === "";
    const divergente = !vazio && unidadeAtual.toUpperCase() !== sugestao.unidadeSugerida.toUpperCase();
    if (!vazio && !divergente) continue;

    precisamSugestao.push({ obra, unidadeAtualVazia: vazio });
  }

  // Busca as sugestões já existentes só pra esse subconjunto, pra
  // preservar aprovação/aplicação de quem não mudou desde o último sync
  // (equivalente ao "aprovadosAntes" da planilha, que preserva revisão
  // já feita ao regenerar a aba).
  const idsComSugestao = precisamSugestao.map((p) => p.obra.id_acao);
  const existentesPorId = new Map<string, SugestaoExistente>();
  for (let i = 0; i < idsComSugestao.length; i += TAMANHO_LOTE) {
    const lote = idsComSugestao.slice(i, i + TAMANHO_LOTE);
    const { data } = await admin
      .from("obras_unidade_sugestao")
      .select("id_acao, unidade_sugerida, quantidade_sugerida, aprovado, aprovado_por, aprovado_em, aplicado_em, aplicado_com_sucesso")
      .in("id_acao", lote);
    (data ?? []).forEach((row) => existentesPorId.set(row.id_acao, row as SugestaoExistente));
  }

  const linhas = precisamSugestao.map(({ obra, unidadeAtualVazia }) => {
    const sugestao = sugerirUnidadeQuantidade({ nome: obra.nome_acao, descricao: obra.descricao_acao, tipologia: obra.tipologia })!;
    const quantidadeSugerida = sugestao.quantidadeSugerida || null;
    const existente = existentesPorId.get(obra.id_acao);
    const mudou =
      !existente ||
      existente.unidade_sugerida.toUpperCase() !== sugestao.unidadeSugerida.toUpperCase() ||
      (existente.quantidade_sugerida || null) !== quantidadeSugerida;

    return {
      id_acao: obra.id_acao,
      unidade_atual: unidadeAtualVazia ? null : obra.unidade_medida,
      quantidade_atual: obra.quantidade === null ? null : paraTextoBR(obra.quantidade),
      unidade_sugerida: sugestao.unidadeSugerida,
      quantidade_sugerida: quantidadeSugerida,
      sem_quantidade: !quantidadeSugerida,
      confianca: sugestao.confianca,
      aviso_tipologia: !!sugestao.avisoTipologia,
      motivo: sugestao.motivo,
      aprovado: mudou ? false : existente!.aprovado,
      aprovado_por: mudou ? null : existente!.aprovado_por,
      aprovado_em: mudou ? null : existente!.aprovado_em,
      aplicado_em: mudou ? null : existente!.aplicado_em,
      aplicado_com_sucesso: mudou ? null : existente!.aplicado_com_sucesso,
      atualizado_em: syncIniciadoEm,
    };
  });

  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const { error } = await admin.from("obras_unidade_sugestao").upsert(lote, { onConflict: "id_acao" });
    if (error) throw new Error(`Falha ao gravar sugestões de unidade: ${error.message}`);
  }

  // Ações que tinham sugestão antes e não precisam mais (Unidade foi
  // corrigida no SIMO, texto mudou, etc.) — mesmo truque de carimbo de
  // tempo usado pra "obras" em vez de um NOT IN gigante.
  const { error: erroDelete } = await admin.from("obras_unidade_sugestao").delete().lt("atualizado_em", syncIniciadoEm);
  if (erroDelete) throw new Error(`Falha ao limpar sugestões de unidade obsoletas: ${erroDelete.message}`);
}

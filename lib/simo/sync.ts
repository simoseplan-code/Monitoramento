import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras, type ObraRow } from "@/lib/simo/parseCsv";
import { sugerirUnidadeQuantidade, paraTextoBR } from "@/lib/unidadeQuantidade/sugestao";
import type { SupabaseClient } from "@supabase/supabase-js";

const TAMANHO_LOTE = 1000;

export async function executarSyncSimo(): Promise<{ linhas: number }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const seg = () => ((Date.now() - inicio) / 1000).toFixed(1);

  // Registra o início ANTES de fazer qualquer coisa: se o servidor matar
  // a execução por tempo (limite da rota), o catch abaixo nunca roda —
  // essa linha fica no histórico do Admin como "interrompida" e é a
  // evidência de timeout, em vez de só um "falha ao conectar" no botão.
  const { data: logRow } = await admin
    .from("sync_log")
    .insert({ sucesso: false, mensagem: "Interrompida antes de terminar (provável timeout do servidor) — sem erro registrado." })
    .select("id")
    .single();
  const finalizarLog = async (campos: { sucesso: boolean; linhas_processadas?: number; mensagem: string }) => {
    if (logRow?.id) await admin.from("sync_log").update(campos).eq("id", logRow.id);
    else await admin.from("sync_log").insert(campos);
  };

  try {
    const cookie = await loginSimo();
    await prepararRelatorioSimo(cookie);
    const csvText = await baixarCsvSimo(cookie);
    const tDownload = seg();
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
    const tGravacao = seg();

    const vinculadas = obras.filter((o) => !!o.numero_automatico).length;
    const pendentes = obras.filter((o) => !o.numero_automatico && !!o.numero_siafe).length;
    const dadoIncorreto = obras.filter((o) => o.numero_siafe && !/^d{8}$/.test(o.numero_siafe)).length;

    // As três operações abaixo são independentes entre si (só dependem
    // do upsert de obras já ter terminado) — rodar em paralelo em vez
    // de sequencial ajuda a caber no limite de tempo da rota.
    const [resDelete] = await Promise.all([
      // Ações que existiam antes desse carimbo e não foram tocadas
      // nesta execução saíram do relatório do SIMO (encerradas/excluídas lá).
      admin.from("obras").delete().lt("atualizado_em", syncIniciadoEm),
      calcularSugestoesUnidade(admin, obras, syncIniciadoEm),
      admin.from("obras_historico").insert({ total: obras.length, vinculadas, pendentes, dado_incorreto: dadoIncorreto }),
    ]);
    if (resDelete.error) throw new Error(`Falha ao remover ações obsoletas: ${resDelete.error.message}`);

    await finalizarLog({
      sucesso: true,
      linhas_processadas: obras.length,
      mensagem: `OK: ${obras.length} ações em ${seg()}s (SIMO+download ${tDownload}s, gravação até ${tGravacao}s, sugestões/limpeza até ${seg()}s).`,
    });

    return { linhas: obras.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await finalizarLog({ sucesso: false, mensagem: `${mensagem} (após ${seg()}s)` });
    throw new Error(mensagem);
  }
}

type SugestaoExistente = {
  id_acao: string;
  unidade_sugerida: string | null;
  quantidade_sugerida: string | null;
  unidade_final: string | null;
  quantidade_final: string | null;
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
  // Guarda a sugestão computada junto (em vez de recalcular depois) —
  // importante porque agora um item pode entrar na fila mesmo com
  // sugestao === null (Unidade vazia, mas o motor não achou nem
  // Tipologia mapeada nem palavra-chave no texto — antes isso sumia da
  // fila silenciosamente; a equipe via 2658 ações com Unidade vazia na
  // base mas só 726 apareciam pra revisar).
  const precisamSugestao: { obra: ObraRow; unidadeAtualVazia: boolean; sugestao: ReturnType<typeof sugerirUnidadeQuantidade> }[] = [];

  for (const obra of obras) {
    const sugestao = sugerirUnidadeQuantidade({ nome: obra.nome_acao, descricao: obra.descricao_acao, tipologia: obra.tipologia });
    const unidadeAtual = (obra.unidade_medida || "").trim();
    const vazio = unidadeAtual === "";

    if (sugestao) {
      const divergente = !vazio && unidadeAtual.toUpperCase() !== sugestao.unidadeSugerida.toUpperCase();
      if (!vazio && !divergente) continue;
      precisamSugestao.push({ obra, unidadeAtualVazia: vazio, sugestao });
    } else if (vazio) {
      // Sem nenhum indício (nem tipologia mapeada, nem texto) — ainda
      // assim precisa de revisão manual, só não dá pra sugerir nada.
      precisamSugestao.push({ obra, unidadeAtualVazia: true, sugestao: null });
    }
    // Sem sugestão e com Unidade já preenchida: não dá pra saber se
    // diverge sem ter com o que comparar — fica de fora, igual antes.
  }

  // Busca as sugestões já existentes só pra esse subconjunto, pra
  // preservar aprovação/aplicação de quem não mudou desde o último sync
  // (equivalente ao "aprovadosAntes" da planilha, que preserva revisão
  // já feita ao regenerar a aba).
  const idsComSugestao = precisamSugestao.map((p) => p.obra.id_acao);
  const lotesIds: string[][] = [];
  for (let i = 0; i < idsComSugestao.length; i += TAMANHO_LOTE) lotesIds.push(idsComSugestao.slice(i, i + TAMANHO_LOTE));
  const resultadosLeitura = await Promise.all(
    lotesIds.map((lote) =>
      admin
        .from("obras_unidade_sugestao")
        .select("id_acao, unidade_sugerida, quantidade_sugerida, unidade_final, quantidade_final, aprovado, aprovado_por, aprovado_em, aplicado_em, aplicado_com_sucesso")
        .in("id_acao", lote)
    )
  );
  // Erro de leitura NÃO pode ser ignorado: sem as sugestões existentes,
  // toda linha pareceria "mudou" e o upsert zeraria aprovações e o
  // registro de "aplicado" de todo mundo.
  const erroLeitura = resultadosLeitura.find((r) => r.error);
  if (erroLeitura?.error) throw new Error(`Falha ao ler sugestões de unidade existentes: ${erroLeitura.error.message}`);
  const existentesPorId = new Map<string, SugestaoExistente>();
  resultadosLeitura.forEach(({ data }) => (data ?? []).forEach((row) => existentesPorId.set(row.id_acao, row as SugestaoExistente)));

  const linhas = precisamSugestao.map(({ obra, unidadeAtualVazia, sugestao }) => {
    const quantidadeSugerida = sugestao?.quantidadeSugerida || null;
    const existente = existentesPorId.get(obra.id_acao);
    const mudou =
      !existente ||
      (existente.unidade_sugerida ?? "").toUpperCase() !== (sugestao?.unidadeSugerida ?? "").toUpperCase() ||
      (existente.quantidade_sugerida || null) !== quantidadeSugerida;

    return {
      id_acao: obra.id_acao,
      unidade_atual: unidadeAtualVazia ? null : obra.unidade_medida,
      quantidade_atual: obra.quantidade === null ? null : paraTextoBR(obra.quantidade),
      unidade_sugerida: sugestao?.unidadeSugerida ?? null,
      quantidade_sugerida: quantidadeSugerida,
      sem_quantidade: !quantidadeSugerida,
      confianca: sugestao?.confianca ?? "baixa",
      aviso_tipologia: !!sugestao?.avisoTipologia,
      motivo: sugestao?.motivo ?? "Nenhuma palavra-chave clara no Nome/Descrição e Tipologia não mapeada — revisar manualmente, escolhendo a unidade certa.",
      unidade_final: mudou ? null : existente!.unidade_final,
      quantidade_final: mudou ? null : existente!.quantidade_final,
      aprovado: mudou ? false : existente!.aprovado,
      aprovado_por: mudou ? null : existente!.aprovado_por,
      aprovado_em: mudou ? null : existente!.aprovado_em,
      aplicado_em: mudou ? null : existente!.aplicado_em,
      aplicado_com_sucesso: mudou ? null : existente!.aplicado_com_sucesso,
      atualizado_em: syncIniciadoEm,
    };
  });

  const lotesLinhas: (typeof linhas)[] = [];
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) lotesLinhas.push(linhas.slice(i, i + TAMANHO_LOTE));
  const resultadosEscrita = await Promise.all(
    lotesLinhas.map((lote) => admin.from("obras_unidade_sugestao").upsert(lote, { onConflict: "id_acao" }))
  );
  const erroEscrita = resultadosEscrita.find((r) => r.error);
  if (erroEscrita?.error) throw new Error(`Falha ao gravar sugestões de unidade: ${erroEscrita.error.message}`);

  // Ações que tinham sugestão antes e não precisam mais (Unidade foi
  // corrigida no SIMO, texto mudou, etc.) — mesmo truque de carimbo de
  // tempo usado pra "obras" em vez de um NOT IN gigante.
  // Linhas já aplicadas no SIMO ficam: depois de gravar, a Unidade do
  // SIMO passa a bater com a sugestão e a ação sai da fila — sem esse
  // filtro a aba "Já aplicadas" esvaziaria a cada sync.
  const { error: erroDelete } = await admin
    .from("obras_unidade_sugestao")
    .delete()
    .lt("atualizado_em", syncIniciadoEm)
    .is("aplicado_em", null);
  if (erroDelete) throw new Error(`Falha ao limpar sugestões de unidade obsoletas: ${erroDelete.message}`);
}

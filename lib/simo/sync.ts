import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras, type ObraRow } from "@/lib/simo/parseCsv";
import { sugerirUnidadeQuantidade, paraTextoBR } from "@/lib/unidadeQuantidade/sugestao";
import type { SupabaseClient } from "@supabase/supabase-js";

const TAMANHO_LOTE = 1000;

// Linha do histórico (sync_log) aberta ANTES do trabalho: se o servidor
// cortar a execução por tempo o catch nunca roda, e essa linha fica como
// evidência dizendo em QUE FASE parou — em vez de só "falha ao conectar".
async function abrirLog(admin: SupabaseClient, rotulo: string) {
  const { data } = await admin
    .from("sync_log")
    .insert({ sucesso: false, mensagem: `${rotulo}: interrompida antes de terminar (provável timeout do servidor).` })
    .select("id")
    .single();
  const id = data?.id as number | undefined;
  return {
    fase: async (texto: string) => {
      if (id) await admin.from("sync_log").update({ mensagem: `${rotulo}: interrompida na fase "${texto}" (provável timeout do servidor).` }).eq("id", id);
    },
    fim: async (campos: { sucesso: boolean; linhas_processadas?: number; mensagem: string }) => {
      if (id) await admin.from("sync_log").update(campos).eq("id", id);
      else await admin.from("sync_log").insert(campos);
    },
  };
}

// ETAPA 1 — baixa o relatório do SIMO e grava as obras. Separada da
// etapa 2 porque juntas não cabem nos 60s da rota (Vercel Hobby).
export async function executarSyncSimo(): Promise<{ linhas: number }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const seg = () => ((Date.now() - inicio) / 1000).toFixed(1);
  const log = await abrirLog(admin, "Sync de obras");

  try {
    // Cada passo com o seu limite e o seu nome na fase: se o servidor cortar,
    // o histórico do Admin mostra em qual deles parou.
    await log.fase("login no SIMO");
    const cookie = await loginSimo(15_000);
    const tLogin = seg();
    await log.fase("preparando o relatório no SIMO");
    await prepararRelatorioSimo(cookie, 20_000);
    const tPreparo = seg();
    await log.fase("exportando o CSV do SIMO (relatório grande)");
    const csvText = await baixarCsvSimo(cookie, Math.max(10_000, 52_000 - (Date.now() - inicio)));
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

    await log.fase("gravando obras no banco");
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

    await log.fase("removendo obsoletas e gravando histórico");
    const vinculadas = obras.filter((o) => !!o.numero_automatico).length;
    const pendentes = obras.filter((o) => !o.numero_automatico && !!o.numero_siafe).length;
    const dadoIncorreto = obras.filter((o) => o.numero_siafe && !/^d{8}$/.test(o.numero_siafe)).length;

    const [resDelete] = await Promise.all([
      // Ações que existiam antes desse carimbo e não foram tocadas
      // nesta execução saíram do relatório do SIMO (encerradas/excluídas lá).
      admin.from("obras").delete().lt("atualizado_em", syncIniciadoEm),
      admin.from("obras_historico").insert({ total: obras.length, vinculadas, pendentes, dado_incorreto: dadoIncorreto }),
    ]);
    if (resDelete.error) throw new Error(`Falha ao remover ações obsoletas: ${resDelete.error.message}`);

    await log.fim({
      sucesso: true,
      linhas_processadas: obras.length,
      mensagem: `OK obras: ${obras.length} ações em ${seg()}s (login ${tLogin}s, preparo até ${tPreparo}s, download até ${tDownload}s, gravação até ${tGravacao}s).`,
    });

    return { linhas: obras.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await log.fim({ sucesso: false, mensagem: `Sync de obras: ${mensagem} (após ${seg()}s)` });
    throw new Error(mensagem);
  }
}

// ETAPA 2 — recalcula a fila de Unidade/Quantidade a partir das obras já
// gravadas no banco (não baixa nada do SIMO).
export async function executarSyncSugestoes(): Promise<{ naFila: number }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const seg = () => ((Date.now() - inicio) / 1000).toFixed(1);
  const log = await abrirLog(admin, "Sugestões de unidade");

  try {
    await log.fase("lendo obras do banco");
    const { data, error } = await admin
      .from("obras")
      .select("id_acao, nome_acao, descricao_acao, tipologia, unidade_medida, quantidade");
    if (error) throw new Error(`Falha ao ler obras: ${error.message}`);
    const obras = (data ?? []) as ObraParaSugestao[];
    if (obras.length === 0) throw new Error("Nenhuma obra no banco — rode o sync de obras primeiro.");
    const tLeitura = seg();

    const naFila = await calcularSugestoesUnidade(admin, obras, new Date().toISOString(), log.fase);

    await log.fim({
      sucesso: true,
      linhas_processadas: naFila,
      mensagem: `OK sugestões: ${naFila} na fila de Unidade/Quantidade em ${seg()}s (leitura ${tLeitura}s).`,
    });
    return { naFila };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await log.fim({ sucesso: false, mensagem: `Sugestões de unidade: ${mensagem} (após ${seg()}s)` });
    throw new Error(mensagem);
  }
}

type ObraParaSugestao = Pick<ObraRow, "id_acao" | "nome_acao" | "descricao_acao" | "tipologia" | "unidade_medida" | "quantidade">;

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
async function calcularSugestoesUnidade(
  admin: SupabaseClient,
  obras: ObraParaSugestao[],
  syncIniciadoEm: string,
  fase: (texto: string) => Promise<void>
): Promise<number> {
  await fase("calculando sugestões");
  // Guarda a sugestão computada junto (em vez de recalcular depois) —
  // importante porque agora um item pode entrar na fila mesmo com
  // sugestao === null (Unidade vazia, mas o motor não achou nem
  // Tipologia mapeada nem palavra-chave no texto — antes isso sumia da
  // fila silenciosamente; a equipe via 2658 ações com Unidade vazia na
  // base mas só 726 apareciam pra revisar).
  const precisamSugestao: { obra: ObraParaSugestao; unidadeAtualVazia: boolean; sugestao: ReturnType<typeof sugerirUnidadeQuantidade> }[] = [];

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
  await fase("lendo sugestões já existentes");
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
      // A análise já feita fica FIXA no ID: aprovação, valor escolhido e
      // "gravado no SIMO" sobrevivem a qualquer novo cálculo — inclusive
      // quando a sugestão do motor muda (regra nova ensinada pela equipe).
      // O valor aprovado é o unidade_final/quantidade_final, que a pessoa
      // escolheu, então não fica velho se a sugestão mudar depois.
      unidade_final: existente?.unidade_final ?? null,
      quantidade_final: existente?.quantidade_final ?? null,
      aprovado: existente?.aprovado ?? false,
      aprovado_por: existente?.aprovado_por ?? null,
      aprovado_em: existente?.aprovado_em ?? null,
      aplicado_em: existente?.aplicado_em ?? null,
      aplicado_com_sucesso: existente?.aplicado_com_sucesso ?? null,
      atualizado_em: syncIniciadoEm,
    };
  });

  await fase("gravando sugestões");
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
  return linhas.length;
}

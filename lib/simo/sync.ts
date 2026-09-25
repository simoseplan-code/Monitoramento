import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras, type ObraRow } from "@/lib/simo/parseCsv";
import { sugerirUnidadeQuantidade, paraTextoBR } from "@/lib/unidadeQuantidade/sugestao";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gzipSync, gunzipSync } from "node:zlib";

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

// Resumo das datas de recebimento lidas: quantas definitivas/provisórias e,
// se não veio nenhuma, quais colunas "extras" (não reconhecidas) o arquivo
// trouxe — mostra se a coluna não veio ou veio com outro nome.
function resumoRecebimento(obras: ObraRow[]): string {
  const comDef = obras.filter((o) => o.data_receb_definitivo).length;
  const comProv = obras.filter((o) => o.data_receb_provisorio).length;
  let texto = ` Datas de recebimento lidas: ${comDef} definitivas, ${comProv} provisórias.`;
  if (comDef + comProv === 0) {
    const chaves = new Set<string>();
    for (const o of obras) for (const k of Object.keys(o.extra)) chaves.add(k);
    const lista = Array.from(chaves).slice(0, 25).join(", ") || "nenhuma";
    texto += ` ATENÇÃO: nenhuma data lida — colunas extras no arquivo: ${lista}.`;
  }
  return texto;
}

// CAMADA 1 — baixa o relatório do SIMO (a parte lenta, às vezes passa de
// 1 minuto) e guarda o CSV compactado no banco (tabela sync_csv). É a única
// camada que fala com o SIMO; recebe o tempo inteiro da requisição.
export async function executarSyncBaixar(): Promise<{ kb: number }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const seg = () => ((Date.now() - inicio) / 1000).toFixed(1);
  const log = await abrirLog(admin, "Download do relatório");
  let tLogin = "-";
  let tPreparo = "-";

  try {
    await log.fase("login no SIMO");
    const cookie = await loginSimo(20_000);
    tLogin = seg();
    await log.fase("preparando o relatório no SIMO");
    await prepararRelatorioSimo(cookie, 60_000);
    tPreparo = seg();
    await log.fase("exportando o CSV do SIMO (relatório grande)");
    // O relatório com as colunas novas passou de 1 minuto pra baixar; a rota
    // roda com 300s (maxDuration) e sobra tempo pra guardar o arquivo.
    const csvText = await baixarCsvSimo(cookie, Math.max(20_000, 270_000 - (Date.now() - inicio)));
    const tExport = seg();

    await log.fase("guardando o CSV no banco");
    const comprimido = gzipSync(Buffer.from(csvText, "utf8")).toString("base64");
    const { data: novo, error } = await admin
      .from("sync_csv")
      .insert({ csv_gzip_b64: comprimido, bytes_originais: csvText.length })
      .select("id")
      .single();
    if (error || !novo) throw new Error(`Falha ao guardar o CSV: ${error?.message ?? "sem retorno"}`);
    await admin.from("sync_csv").delete().lt("id", novo.id);

    const kb = Math.round(csvText.length / 1024);
    await log.fim({
      sucesso: true,
      mensagem: `OK download: ${kb} KB em ${seg()}s (login ${tLogin}s, preparo até ${tPreparo}s, exportação até ${tExport}s).`,
    });
    return { kb };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await log.fim({ sucesso: false, mensagem: `Download do relatório: ${mensagem} (login ${tLogin}s, preparo até ${tPreparo}s, parou em ${seg()}s)` });
    throw new Error(mensagem);
  }
}

// CAMADA 2 — lê o CSV já baixado e grava as obras. Não fala com o SIMO.
export async function executarSyncObras(): Promise<{ linhas: number }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const seg = () => ((Date.now() - inicio) / 1000).toFixed(1);
  const log = await abrirLog(admin, "Sync de obras");

  try {
    await log.fase("lendo o relatório baixado");
    const { data: csvRow, error: erroCsv } = await admin
      .from("sync_csv")
      .select("criado_em, csv_gzip_b64")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (erroCsv) throw new Error(`Falha ao ler o relatório baixado: ${erroCsv.message}`);
    if (!csvRow) throw new Error("Nenhum relatório baixado ainda — rode a etapa de download primeiro.");
    const idadeHoras = (Date.now() - new Date(csvRow.criado_em).getTime()) / 3_600_000;
    if (idadeHoras > 24) throw new Error("O relatório baixado tem mais de 24h — rode a etapa de download de novo.");

    const csvText = gunzipSync(Buffer.from(csvRow.csv_gzip_b64, "base64")).toString("utf8");
    const obras = csvParaObras(csvText);
    const tLeitura = seg();

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
    const dadoIncorreto = obras.filter((o) => o.numero_siafe && !/^\d{8}$/.test(o.numero_siafe)).length;

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
      mensagem: `OK obras: ${obras.length} ações em ${seg()}s (leitura ${tLeitura}s, gravação até ${tGravacao}s).${resumoRecebimento(obras)}`,
    });

    return { linhas: obras.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await log.fim({ sucesso: false, mensagem: `Sync de obras: ${mensagem} (após ${seg()}s)` });
    throw new Error(mensagem);
  }
}

// CAMADA 3 — recalcula a fila de Unidade/Quantidade a partir das obras já
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

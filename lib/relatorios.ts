import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { DATA_INICIO_REVISAO, ehConveniada } from "@/lib/novasAcoes";

export type TipoRelatorio = "completo" | "novas_acoes" | "sobreposicoes" | "termos";

type Linha = Record<string, string | number | null>;
type Coluna = { cabecalho: string; chave: string; largura?: number; quebra?: boolean };
type Aba = { nome: string; colunas: Coluna[]; linhas: Linha[] };

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short" });

export function dataHora(iso: string | null | undefined): string {
  return iso ? fmtDataHora.format(new Date(iso)) : "";
}

export function data(iso: string | null | undefined): string {
  if (!iso) return "";
  // "AAAA-MM-DD" puro (coluna date) não pode passar por fuso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return fmtData.format(new Date(iso));
}

const ROTULO_ITEM: Record<string, string> = {
  pendente: "Não analisado",
  confirmado: "Confirmado",
  aguardando_atualizacao: "Aguardando atualização",
};

// O PostgREST devolve no máximo N linhas por chamada: busca em páginas até acabar.
export async function buscarTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const tamanho = 1000;
  const todos: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data: lote, error } = await pagina(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    todos.push(...(lote ?? []));
    if (!lote || lote.length < tamanho) break;
  }
  return todos;
}

export type Admin = ReturnType<typeof createAdminClient>;

export async function nomesDePessoas(admin: Admin): Promise<Map<string, string>> {
  const { data: perfis } = await admin.from("profiles").select("id, nome");
  return new Map((perfis ?? []).map((p) => [p.id as string, p.nome as string]));
}

export function ontemIso(): string {
  return new Date(Date.now() - 3 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
}

// ───────────────────────── Novas Ações ─────────────────────────
async function abasNovasAcoes(admin: Admin, nomes: Map<string, string>): Promise<Aba[]> {
  const [obrasTodas, revisoes] = await Promise.all([
    buscarTudo<{ id_acao: string; nome_acao: string; orgao: string | null; data_criacao: string | null; acao_conveniada: string | null }>(
      (de, ate) =>
        admin
          .from("obras")
          .select("id_acao, nome_acao, orgao, data_criacao, acao_conveniada")
          .gte("data_criacao", DATA_INICIO_REVISAO)
          .lte("data_criacao", ontemIso())
          .order("id_acao")
          .range(de, ate)
    ),
    buscarTudo<{
      id_acao: string;
      kml_anexado: string;
      sem_duplicacao: string;
      documentos_obrigatorios: string;
      concluido: boolean | null;
      concluido_em: string | null;
      concluido_por: string | null;
      responsavel_id: string | null;
      revisado_por: string | null;
      revisado_em: string | null;
      nome_acao: string | null;
      orgao: string | null;
      data_criacao: string | null;
      excluida_em: string | null;
    }>((de, ate) =>
      admin
        .from("obras_revisao")
        .select("id_acao, kml_anexado, sem_duplicacao, documentos_obrigatorios, concluido, concluido_em, concluido_por, responsavel_id, revisado_por, revisado_em, nome_acao, orgao, data_criacao, excluida_em")
        .order("id_acao")
        .range(de, ate)
    ),
  ]);

  const revisaoPorId = new Map(revisoes.map((r) => [r.id_acao, r]));
  const obras = obrasTodas.filter((o) => !ehConveniada(o.acao_conveniada));

  type Resumo = { total: number; concluidas: number; emAnalise: number; naoIniciadas: number; comPendenciaOrgao: number; itens: Record<string, Record<string, number>> };
  const novoResumo = (): Resumo => ({
    total: 0,
    concluidas: 0,
    emAnalise: 0,
    naoIniciadas: 0,
    comPendenciaOrgao: 0,
    itens: { kml: {}, dup: {}, docs: {} },
  });
  const geral = novoResumo();
  const porOrgao = new Map<string, Resumo>();

  const detalhe: Linha[] = obras.map((o) => {
    const r = revisaoPorId.get(o.id_acao);
    const kml = r?.kml_anexado ?? "pendente";
    const dup = r?.sem_duplicacao ?? "pendente";
    const docs = r?.documentos_obrigatorios ?? "pendente";
    // Mesma regra do Desempenho e do menu: flag de conclusão OU os 3 itens confirmados.
    const concluida = !!r?.concluido || [kml, dup, docs].every((v) => v === "confirmado");
    const algumLaranja = [kml, dup, docs].includes("aguardando_atualizacao");
    const iniciada = [kml, dup, docs].some((v) => v !== "pendente");
    const situacao = concluida ? "Concluída" : algumLaranja ? "Em análise, com pendência" : iniciada ? "Em análise" : "Não iniciada";

    for (const alvo of [geral, porOrgao.get(o.orgao ?? "Sem órgão") ?? (porOrgao.set(o.orgao ?? "Sem órgão", novoResumo()), porOrgao.get(o.orgao ?? "Sem órgão")!)]) {
      alvo.total++;
      if (concluida) alvo.concluidas++;
      else if (iniciada) alvo.emAnalise++;
      else alvo.naoIniciadas++;
      if (!concluida && algumLaranja) alvo.comPendenciaOrgao++;
      if (!concluida) {
        alvo.itens.kml[kml] = (alvo.itens.kml[kml] ?? 0) + 1;
        alvo.itens.dup[dup] = (alvo.itens.dup[dup] ?? 0) + 1;
        alvo.itens.docs[docs] = (alvo.itens.docs[docs] ?? 0) + 1;
      }
    }

    return {
      id: o.id_acao,
      nome: o.nome_acao,
      orgao: o.orgao ?? "",
      criada: data(o.data_criacao),
      situacao,
      kml: ROTULO_ITEM[kml] ?? kml,
      dup: ROTULO_ITEM[dup] ?? dup,
      docs: ROTULO_ITEM[docs] ?? docs,
      responsavel: nomes.get(r?.responsavel_id ?? r?.revisado_por ?? "") ?? "",
      concluidaEm: dataHora(r?.concluido_em),
      concluidaPor: nomes.get(r?.concluido_por ?? "") ?? "",
      ultimaRevisao: dataHora(r?.revisado_em),
    };
  });

  // Ações que sumiram do SIMO: não somem do relatório, entram marcadas.
  const idsNoEscopo = new Set(obras.map((o) => o.id_acao));
  const excluidas = revisoes.filter((r) => r.excluida_em && !idsNoEscopo.has(r.id_acao));
  let excluidasPendentes = 0;
  for (const r of excluidas) {
    const itens = [r.kml_anexado, r.sem_duplicacao, r.documentos_obrigatorios];
    const concluida = !!r.concluido || itens.every((v) => v === "confirmado");
    if (!concluida) excluidasPendentes++;
    detalhe.push({
      id: r.id_acao,
      nome: r.nome_acao ?? "(nome não guardado, a ação sumiu antes do registro)",
      orgao: r.orgao ?? "",
      criada: data(r.data_criacao),
      situacao: concluida ? "Concluída (ação excluída do SIMO)" : "Pendente, AÇÃO EXCLUÍDA DO SIMO",
      kml: ROTULO_ITEM[r.kml_anexado] ?? r.kml_anexado,
      dup: ROTULO_ITEM[r.sem_duplicacao] ?? r.sem_duplicacao,
      docs: ROTULO_ITEM[r.documentos_obrigatorios] ?? r.documentos_obrigatorios,
      responsavel: nomes.get(r.responsavel_id ?? r.revisado_por ?? "") ?? "",
      concluidaEm: dataHora(r.concluido_em),
      concluidaPor: nomes.get(r.concluido_por ?? "") ?? "",
      ultimaRevisao: dataHora(r.revisado_em),
    });
  }

  const resumo: Linha[] = [
    { indicador: `Ações no escopo da revisão (criadas desde ${data(DATA_INICIO_REVISAO)}, sem conveniadas)`, valor: geral.total },
    { indicador: "Análises concluídas", valor: geral.concluidas },
    { indicador: "Em análise (iniciadas, não concluídas)", valor: geral.emAnalise },
    { indicador: "Não iniciadas", valor: geral.naoIniciadas },
    { indicador: "Ações excluídas do SIMO com análise pendente (não entram nos totais acima)", valor: excluidasPendentes },
    { indicador: "Não concluídas com algum item aguardando atualização do órgão", valor: geral.comPendenciaOrgao },
    ...(["kml", "dup", "docs"] as const).flatMap((k) => {
      const nome = k === "kml" ? "KML anexado" : k === "dup" ? "Sem duplicação" : "Documentos obrigatórios";
      return ["confirmado", "aguardando_atualizacao", "pendente"].map((st) => ({
        indicador: `${nome}, ${ROTULO_ITEM[st]} (entre as não concluídas)`,
        valor: geral.itens[k][st] ?? 0,
      }));
    }),
  ];

  const orgaos: Linha[] = Array.from(porOrgao.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([orgao, r]) => ({
      orgao,
      total: r.total,
      concluidas: r.concluidas,
      emAnalise: r.emAnalise,
      naoIniciadas: r.naoIniciadas,
      comPendenciaOrgao: r.comPendenciaOrgao,
      kmlAguardando: r.itens.kml.aguardando_atualizacao ?? 0,
      kmlNaoAnalisado: r.itens.kml.pendente ?? 0,
      dupAguardando: r.itens.dup.aguardando_atualizacao ?? 0,
      dupNaoAnalisado: r.itens.dup.pendente ?? 0,
      docsAguardando: r.itens.docs.aguardando_atualizacao ?? 0,
      docsNaoAnalisado: r.itens.docs.pendente ?? 0,
    }));

  const responsaveis = new Map<string, { concluidas: number; pendentes: number }>();
  for (const l of detalhe) {
    const nome = String(l.responsavel);
    if (!nome) continue;
    // Ação excluída do SIMO fica visível no detalhe, mas não conta na produção por pessoa.
    if (String(l.situacao).toLowerCase().includes("excluída")) continue;
    const x = responsaveis.get(nome) ?? { concluidas: 0, pendentes: 0 };
    if (l.situacao === "Concluída") x.concluidas++;
    else if (l.situacao !== "Não iniciada") x.pendentes++;
    responsaveis.set(nome, x);
  }
  const porPessoa: Linha[] = Array.from(responsaveis.entries())
    .sort((a, b) => b[1].concluidas + b[1].pendentes - (a[1].concluidas + a[1].pendentes))
    .map(([pessoa, x]) => ({ pessoa, concluidas: x.concluidas, pendentes: x.pendentes, total: x.concluidas + x.pendentes }));

  return [
    { nome: "Novas Ações - resumo", colunas: [{ cabecalho: "Indicador", chave: "indicador", largura: 80 }, { cabecalho: "Valor", chave: "valor", largura: 12 }], linhas: resumo },
    {
      nome: "Novas Ações - por órgão",
      colunas: [
        { cabecalho: "Órgão", chave: "orgao", largura: 28 },
        { cabecalho: "Total", chave: "total", largura: 9 },
        { cabecalho: "Concluídas", chave: "concluidas", largura: 12 },
        { cabecalho: "Em análise", chave: "emAnalise", largura: 12 },
        { cabecalho: "Não iniciadas", chave: "naoIniciadas", largura: 14 },
        { cabecalho: "Com pendência do órgão", chave: "comPendenciaOrgao", largura: 22 },
        { cabecalho: "KML aguardando atualização", chave: "kmlAguardando", largura: 24 },
        { cabecalho: "KML não analisado", chave: "kmlNaoAnalisado", largura: 18 },
        { cabecalho: "Duplicação aguardando atualização", chave: "dupAguardando", largura: 26 },
        { cabecalho: "Duplicação não analisada", chave: "dupNaoAnalisado", largura: 22 },
        { cabecalho: "Documentos aguardando atualização", chave: "docsAguardando", largura: 26 },
        { cabecalho: "Documentos não analisados", chave: "docsNaoAnalisado", largura: 24 },
      ],
      linhas: orgaos,
    },
    {
      nome: "Novas Ações - por pessoa",
      colunas: [
        { cabecalho: "Responsável", chave: "pessoa", largura: 34 },
        { cabecalho: "Concluídas", chave: "concluidas", largura: 12 },
        { cabecalho: "Pendentes", chave: "pendentes", largura: 12 },
        { cabecalho: "Total", chave: "total", largura: 9 },
      ],
      linhas: porPessoa,
    },
    {
      nome: "Novas Ações - detalhe",
      colunas: [
        { cabecalho: "ID da ação", chave: "id", largura: 11 },
        { cabecalho: "Nome da ação", chave: "nome", largura: 60, quebra: true },
        { cabecalho: "Órgão", chave: "orgao", largura: 16 },
        { cabecalho: "Criada em", chave: "criada", largura: 12 },
        { cabecalho: "Situação", chave: "situacao", largura: 26 },
        { cabecalho: "KML anexado", chave: "kml", largura: 22 },
        { cabecalho: "Sem duplicação", chave: "dup", largura: 22 },
        { cabecalho: "Documentos obrigatórios", chave: "docs", largura: 22 },
        { cabecalho: "Responsável", chave: "responsavel", largura: 28 },
        { cabecalho: "Concluída em", chave: "concluidaEm", largura: 17 },
        { cabecalho: "Concluída por", chave: "concluidaPor", largura: 28 },
        { cabecalho: "Última revisão", chave: "ultimaRevisao", largura: 17 },
      ],
      linhas: detalhe,
    },
  ];
}

// ───────────────────────── Sobreposições ─────────────────────────
const ROTULO_SOBRE: Record<string, string> = {
  pendente: "Aguardando revisão",
  ok: "Sem problema (não é sobreposição)",
  problema: "Com problema (verificação posterior)",
  solucionado: "Solucionado",
};

async function abasSobreposicoes(admin: Admin, nomes: Map<string, string>): Promise<Aba[]> {
  type Obra = { id?: string | null; nome?: string | null; orgao?: string | null };
  const locais = await buscarTudo<{
    chave_local: string;
    obras: Obra[] | null;
    qtd_obras: number | null;
    extensao_m: number | null;
    tolerancia_m: number | null;
    qtd_segmentos: number | null;
    lat_inicio: number | null;
    lon_inicio: number | null;
    status: string;
    observacao: string | null;
    revisado_por: string | null;
    revisado_em: string | null;
    responsavel_id: string | null;
    solucionado_por: string | null;
    solucionado_em: string | null;
    solucao: string | null;
    importado_em: string | null;
  }>((de, ate) =>
    admin
      .from("sobreposicoes")
      .select("chave_local, obras, qtd_obras, extensao_m, tolerancia_m, qtd_segmentos, lat_inicio, lon_inicio, status, observacao, revisado_por, revisado_em, responsavel_id, solucionado_por, solucionado_em, solucao, importado_em")
      .order("chave_local")
      .range(de, ate)
  );

  const contagem: Record<string, number> = { pendente: 0, ok: 0, problema: 0, solucionado: 0 };
  const porPessoa = new Map<string, { ok: number; problema: number; solucionado: number; solucionou: number }>();
  const pessoa = (n: string) => {
    const x = porPessoa.get(n) ?? { ok: 0, problema: 0, solucionado: 0, solucionou: 0 };
    porPessoa.set(n, x);
    return x;
  };

  const detalhe: Linha[] = locais.map((l) => {
    contagem[l.status] = (contagem[l.status] ?? 0) + 1;
    const responsavel = nomes.get(l.responsavel_id ?? l.revisado_por ?? "") ?? "";
    const solucionou = nomes.get(l.solucionado_por ?? "") ?? "";
    if (responsavel && l.status !== "pendente") {
      const x = pessoa(responsavel);
      if (l.status === "ok") x.ok++;
      else if (l.status === "problema") x.problema++;
      else if (l.status === "solucionado") x.solucionado++;
    }
    if (solucionou && l.status === "solucionado") pessoa(solucionou).solucionou++;

    const obras = l.obras ?? [];
    return {
      status: ROTULO_SOBRE[l.status] ?? l.status,
      qtdObras: l.qtd_obras ?? obras.length,
      ids: obras.map((o) => o.id ?? "?").join(", "),
      orgaos: Array.from(new Set(obras.map((o) => (o.orgao ?? "").trim()).filter(Boolean))).join(", "),
      nomes: obras.map((o) => `${o.id ?? "?"}: ${o.nome ?? ""}`).join("\n"),
      extensao: l.extensao_m != null ? Math.round(l.extensao_m) : null,
      tolerancia: l.tolerancia_m,
      segmentos: l.qtd_segmentos,
      mapa: l.lat_inicio != null && l.lon_inicio != null ? `https://www.google.com/maps?q=${l.lat_inicio},${l.lon_inicio}` : "",
      responsavel,
      revisadoEm: dataHora(l.revisado_em),
      observacao: l.observacao ?? "",
      solucionadoPor: solucionou,
      solucao: l.solucao ?? "",
      solucionadoEm: dataHora(l.solucionado_em),
      importadoEm: dataHora(l.importado_em),
      chave: l.chave_local,
    };
  });

  const resumo: Linha[] = [
    { indicador: "Locais de sobreposição importados", valor: locais.length },
    { indicador: ROTULO_SOBRE.pendente, valor: contagem.pendente },
    { indicador: ROTULO_SOBRE.ok, valor: contagem.ok },
    { indicador: ROTULO_SOBRE.problema, valor: contagem.problema },
    { indicador: ROTULO_SOBRE.solucionado, valor: contagem.solucionado },
    { indicador: "Locais com observação registrada", valor: locais.filter((l) => (l.observacao ?? "").trim()).length },
  ];

  const pessoas: Linha[] = Array.from(porPessoa.entries())
    .sort((a, b) => b[1].ok + b[1].problema + b[1].solucionado - (a[1].ok + a[1].problema + a[1].solucionado))
    .map(([nome, x]) => ({
      pessoa: nome,
      ok: x.ok,
      problema: x.problema + x.solucionado,
      total: x.ok + x.problema + x.solucionado,
      solucionou: x.solucionou,
    }));

  return [
    { nome: "Sobreposições - resumo", colunas: [{ cabecalho: "Indicador", chave: "indicador", largura: 50 }, { cabecalho: "Valor", chave: "valor", largura: 12 }], linhas: resumo },
    {
      nome: "Sobreposições - por pessoa",
      colunas: [
        { cabecalho: "Responsável", chave: "pessoa", largura: 34 },
        { cabecalho: "Sem problema", chave: "ok", largura: 14 },
        { cabecalho: "Com problema (inclui solucionados)", chave: "problema", largura: 32 },
        { cabecalho: "Total analisadas", chave: "total", largura: 16 },
        { cabecalho: "Marcou como solucionado", chave: "solucionou", largura: 22 },
      ],
      linhas: pessoas,
    },
    {
      nome: "Sobreposições - detalhe",
      colunas: [
        { cabecalho: "Situação", chave: "status", largura: 34 },
        { cabecalho: "Obras", chave: "qtdObras", largura: 8 },
        { cabecalho: "IDs das ações", chave: "ids", largura: 18 },
        { cabecalho: "Órgãos", chave: "orgaos", largura: 20 },
        { cabecalho: "Ações envolvidas", chave: "nomes", largura: 70, quebra: true },
        { cabecalho: "Extensão sobreposta (m)", chave: "extensao", largura: 16 },
        { cabecalho: "Tolerância (m)", chave: "tolerancia", largura: 13 },
        { cabecalho: "Segmentos", chave: "segmentos", largura: 11 },
        { cabecalho: "Responsável", chave: "responsavel", largura: 28 },
        { cabecalho: "Revisado em", chave: "revisadoEm", largura: 17 },
        { cabecalho: "Observação", chave: "observacao", largura: 50, quebra: true },
        { cabecalho: "Como foi solucionado", chave: "solucao", largura: 50, quebra: true },
        { cabecalho: "Solucionado por", chave: "solucionadoPor", largura: 28 },
        { cabecalho: "Solucionado em", chave: "solucionadoEm", largura: 17 },
        { cabecalho: "Início no mapa", chave: "mapa", largura: 40 },
        { cabecalho: "Importado em", chave: "importadoEm", largura: 17 },
        { cabecalho: "Chave do local", chave: "chave", largura: 30 },
      ],
      linhas: detalhe,
    },
  ];
}

// ───────────────────────── Termos ─────────────────────────
async function abasTermos(admin: Admin, nomes: Map<string, string>): Promise<Aba[]> {
  const [obras, revisoes] = await Promise.all([
    buscarTudo<{
      id_acao: string;
      nome_acao: string;
      orgao: string | null;
      tipo_outros_documentos: string | null;
      percentual_execucao: number | null;
      data_receb_definitivo: string | null;
      data_receb_provisorio: string | null;
    }>((de, ate) =>
      admin
        .from("obras")
        .select("id_acao, nome_acao, orgao, tipo_outros_documentos, percentual_execucao, data_receb_definitivo, data_receb_provisorio")
        .ilike("status", "conclu%")
        .or("tipo_outros_documentos.ilike.TERMO DE ENCERRAMENTO POR INATIVIDADE%,tipo_outros_documentos.ilike.TERMO DE RESCIS%")
        .order("id_acao")
        .range(de, ate)
    ),
    buscarTudo<{ id_acao: string; status: string; observacao: string | null; revisado_por: string | null; revisado_em: string | null }>(
      (de, ate) => admin.from("obras_termos_revisao").select("id_acao, status, observacao, revisado_por, revisado_em").order("id_acao").range(de, ate)
    ),
  ]);
  const revisaoPorId = new Map(revisoes.map((r) => [r.id_acao, r]));
  const rotulo: Record<string, string> = { pendente: "Aguardando conferência", corrigido: "Corrigido", problema: "Com problema" };
  const contagem: Record<string, number> = { pendente: 0, corrigido: 0, problema: 0 };

  const detalhe: Linha[] = obras.map((o) => {
    const r = revisaoPorId.get(o.id_acao);
    const status = r?.status ?? "pendente";
    contagem[status] = (contagem[status] ?? 0) + 1;
    return {
      id: o.id_acao,
      nome: o.nome_acao,
      orgao: o.orgao ?? "",
      tipo: (o.tipo_outros_documentos ?? "").toUpperCase().startsWith("TERMO DE RESCIS") ? "Termo de Rescisão" : "Termo de Encerramento por Inatividade (TEI)",
      situacao: rotulo[status] ?? status,
      observacao: r?.observacao ?? "",
      conferidoPor: nomes.get(r?.revisado_por ?? "") ?? "",
      conferidoEm: dataHora(r?.revisado_em),
      execucao: o.percentual_execucao != null ? `${(o.percentual_execucao * 100).toFixed(2).replace(".", ",")}%` : "",
      recebimento: data(o.data_receb_definitivo ?? o.data_receb_provisorio),
    };
  });

  return [
    {
      nome: "Termos - resumo",
      colunas: [{ cabecalho: "Indicador", chave: "indicador", largura: 50 }, { cabecalho: "Valor", chave: "valor", largura: 12 }],
      linhas: [
        { indicador: "Ações concluídas com TEI ou Termo de Rescisão", valor: obras.length },
        { indicador: rotulo.pendente, valor: contagem.pendente },
        { indicador: rotulo.corrigido, valor: contagem.corrigido },
        { indicador: rotulo.problema, valor: contagem.problema },
      ],
    },
    {
      nome: "Termos - detalhe",
      colunas: [
        { cabecalho: "ID da ação", chave: "id", largura: 11 },
        { cabecalho: "Nome da ação", chave: "nome", largura: 60, quebra: true },
        { cabecalho: "Órgão", chave: "orgao", largura: 16 },
        { cabecalho: "Tipo do termo", chave: "tipo", largura: 40 },
        { cabecalho: "Situação", chave: "situacao", largura: 22 },
        { cabecalho: "Observação", chave: "observacao", largura: 50, quebra: true },
        { cabecalho: "Conferido por", chave: "conferidoPor", largura: 28 },
        { cabecalho: "Conferido em", chave: "conferidoEm", largura: 17 },
        { cabecalho: "Execução", chave: "execucao", largura: 11 },
        { cabecalho: "Recebimento", chave: "recebimento", largura: 13 },
      ],
      linhas: detalhe,
    },
  ];
}

// ───────────────────────── Unidade/Quantidade e Vinculação ─────────────────────────
async function abasUnidadeEVinculacao(admin: Admin, nomes: Map<string, string>): Promise<Aba[]> {
  const sugestoes = await buscarTudo<{
    id_acao: string;
    unidade_atual: string | null;
    quantidade_atual: string | null;
    unidade_sugerida: string | null;
    quantidade_sugerida: string | null;
    unidade_final: string | null;
    quantidade_final: string | null;
    confianca: string | null;
    motivo: string | null;
    aprovado: boolean;
    aprovado_por: string | null;
    aprovado_em: string | null;
    aplicado_em: string | null;
    aplicado_com_sucesso: boolean | null;
  }>((de, ate) =>
    admin
      .from("obras_unidade_sugestao")
      .select("id_acao, unidade_atual, quantidade_atual, unidade_sugerida, quantidade_sugerida, unidade_final, quantidade_final, confianca, motivo, aprovado, aprovado_por, aprovado_em, aplicado_em, aplicado_com_sucesso")
      .order("id_acao")
      .range(de, ate)
  );

  const info = new Map<string, { nome: string; orgao: string }>();
  const ids = sugestoes.map((s) => s.id_acao);
  for (let i = 0; i < ids.length; i += 400) {
    const { data: obras } = await admin.from("obras").select("id_acao, nome_acao, orgao").in("id_acao", ids.slice(i, i + 400));
    for (const o of obras ?? []) info.set(o.id_acao as string, { nome: o.nome_acao as string, orgao: (o.orgao as string) ?? "" });
  }

  const unidade: Linha[] = sugestoes.map((s) => ({
    id: s.id_acao,
    nome: info.get(s.id_acao)?.nome ?? "",
    orgao: info.get(s.id_acao)?.orgao ?? "",
    atual: [s.unidade_atual, s.quantidade_atual].filter(Boolean).join(" / "),
    sugerida: [s.unidade_sugerida, s.quantidade_sugerida].filter(Boolean).join(" / "),
    final: [s.unidade_final, s.quantidade_final].filter(Boolean).join(" / "),
    confianca: s.confianca === "alta" ? "Alta" : s.confianca === "baixa" ? "Baixa" : "",
    motivo: s.motivo ?? "",
    situacao: s.aplicado_em ? (s.aplicado_com_sucesso ? "Gravada no SIMO" : "Gravação com falha") : s.aprovado ? "Aprovada, aguardando gravação" : "Aguardando aprovação",
    aprovadoPor: nomes.get(s.aprovado_por ?? "") ?? "",
    aprovadoEm: dataHora(s.aprovado_em),
    aplicadoEm: dataHora(s.aplicado_em),
  }));

  const vinc = await buscarTudo<{ id_acao: string; nome_acao: string | null; numero_siafe: string | null; resultado: string; executado_por: string | null; executado_em: string }>(
    (de, ate) =>
      admin
        .from("obras_vinculacao_log")
        .select("id_acao, nome_acao, numero_siafe, resultado, executado_por, executado_em")
        .order("executado_em", { ascending: false })
        .range(de, ate)
  );

  return [
    {
      nome: "Unidade-Quantidade",
      colunas: [
        { cabecalho: "ID da ação", chave: "id", largura: 11 },
        { cabecalho: "Nome da ação", chave: "nome", largura: 55, quebra: true },
        { cabecalho: "Órgão", chave: "orgao", largura: 16 },
        { cabecalho: "Unidade / quantidade no SIMO", chave: "atual", largura: 26 },
        { cabecalho: "Sugerida", chave: "sugerida", largura: 22 },
        { cabecalho: "Final (aprovada)", chave: "final", largura: 22 },
        { cabecalho: "Confiança", chave: "confianca", largura: 11 },
        { cabecalho: "Motivo da sugestão", chave: "motivo", largura: 45, quebra: true },
        { cabecalho: "Situação", chave: "situacao", largura: 28 },
        { cabecalho: "Aprovado por", chave: "aprovadoPor", largura: 28 },
        { cabecalho: "Aprovado em", chave: "aprovadoEm", largura: 17 },
        { cabecalho: "Gravado no SIMO em", chave: "aplicadoEm", largura: 17 },
      ],
      linhas: unidade,
    },
    {
      nome: "Vinculação SIAFE",
      colunas: [
        { cabecalho: "Data", chave: "quando", largura: 17 },
        { cabecalho: "ID da ação", chave: "id", largura: 11 },
        { cabecalho: "Nome da ação", chave: "nome", largura: 55, quebra: true },
        { cabecalho: "Nº SIAFE", chave: "siafe", largura: 14 },
        { cabecalho: "Resultado", chave: "resultado", largura: 50, quebra: true },
        { cabecalho: "Executado por", chave: "por", largura: 28 },
      ],
      linhas: vinc.map((v) => ({
        quando: dataHora(v.executado_em),
        id: v.id_acao,
        nome: v.nome_acao ?? "",
        siafe: v.numero_siafe ?? "",
        resultado: v.resultado,
        por: nomes.get(v.executado_por ?? "") ?? "",
      })),
    },
  ];
}

// ───────────────────────── Histórico de atividades (só admin) ─────────────────────────
const ROTULO_MODULO: Record<string, string> = {
  novas_acoes: "Novas Ações",
  sobreposicoes: "Sobreposições",
  termos: "Termos",
  unidade_quantidade: "Unidade/Quantidade",
  vinculacao: "Vinculação SIAFE",
};

async function abaAtividades(admin: Admin, nomes: Map<string, string>): Promise<Aba> {
  const log = await buscarTudo<{ criado_em: string; usuario_id: string; modulo: string; acao: string; referencia: string; detalhe: string | null }>(
    (de, ate) => admin.from("analises_log").select("criado_em, usuario_id, modulo, acao, referencia, detalhe").order("criado_em", { ascending: false }).range(de, ate)
  );
  return {
    nome: "Histórico de atividades",
    colunas: [
      { cabecalho: "Data e hora", chave: "quando", largura: 17 },
      { cabecalho: "Pessoa", chave: "pessoa", largura: 30 },
      { cabecalho: "Tela", chave: "tela", largura: 20 },
      { cabecalho: "O que foi feito", chave: "acao", largura: 24 },
      { cabecalho: "Ação / local", chave: "ref", largura: 30 },
      { cabecalho: "Detalhe", chave: "detalhe", largura: 50, quebra: true },
    ],
    linhas: log.map((l) => ({
      quando: dataHora(l.criado_em),
      pessoa: nomes.get(l.usuario_id) ?? "",
      tela: ROTULO_MODULO[l.modulo] ?? l.modulo,
      acao: l.acao.replace(/_/g, " "),
      ref: l.referencia,
      detalhe: l.detalhe === "retroativo" ? "Registro reconstruído (anterior ao histórico)" : (l.detalhe ?? ""),
    })),
  };
}

// ───────────────────────── Planilha ─────────────────────────
function aplicarAba(wb: ExcelJS.Workbook, aba: Aba) {
  const ws = wb.addWorksheet(aba.nome.slice(0, 31));
  ws.columns = aba.colunas.map((c) => ({ header: c.cabecalho, key: c.chave, width: c.largura ?? 16 }));
  const cabecalho = ws.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A78D6" } };
  cabecalho.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const l of aba.linhas) ws.addRow(l);
  if (aba.linhas.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } };
  aba.colunas.forEach((c, i) => {
    if (c.quebra) ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: true };
  });
}

export async function gerarRelatorio(tipo: TipoRelatorio, opcoes: { ehAdmin: boolean }): Promise<{ buffer: Buffer; arquivo: string }> {
  const admin = createAdminClient();
  const nomes = await nomesDePessoas(admin);
  const abas: Aba[] = [];

  if (tipo === "novas_acoes" || tipo === "completo") abas.push(...(await abasNovasAcoes(admin, nomes)));
  if (tipo === "sobreposicoes" || tipo === "completo") abas.push(...(await abasSobreposicoes(admin, nomes)));
  if (tipo === "termos" || tipo === "completo") abas.push(...(await abasTermos(admin, nomes)));
  if (tipo === "completo") {
    abas.push(...(await abasUnidadeEVinculacao(admin, nomes)));
    if (opcoes.ehAdmin) abas.push(await abaAtividades(admin, nomes));
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Monitoramento de Obras";
  wb.created = new Date();

  // Capa com o que o arquivo contém e quando foi gerado.
  const capa: Aba = {
    nome: "Sobre este relatório",
    colunas: [{ cabecalho: "Item", chave: "item", largura: 34 }, { cabecalho: "Informação", chave: "info", largura: 90 }],
    linhas: [
      { item: "Relatório", info: { completo: "Completo (todas as telas)", novas_acoes: "Novas Ações", sobreposicoes: "Sobreposições", termos: "Termos (Outros Documentos)" }[tipo] },
      { item: "Gerado em", info: dataHora(new Date().toISOString()) },
      { item: "Situação", info: "Retrato do sistema no momento da geração (estado atual de cada análise)." },
      { item: "Abas", info: abas.map((a) => a.nome).join(" | ") },
    ],
  };
  aplicarAba(wb, capa);
  for (const aba of abas) aplicarAba(wb, aba);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return { buffer, arquivo: `relatorio-${tipo.replace("_", "-")}-${hoje}.xlsx` };
}

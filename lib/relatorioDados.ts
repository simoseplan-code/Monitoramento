import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { DATA_INICIO_REVISAO, ehConveniada } from "@/lib/novasAcoes";
import { buscarTudo, data, dataHora, nomesDePessoas, ontemIso } from "@/lib/relatorios";
import { calcularDesempenho, type Desempenho, type LinhaAgregada } from "@/lib/desempenho";

export type Par = { nome: string; valor: number };

export type DadosGestao = {
  antes2023: number;
  total2023: number;
  vinculadas: number;
  pendentes: number;
  semNumero: number;
  dadoIncorreto: number;
  orgaos: number;
  status: Par[];
};

export type DadosNovasAcoes = {
  total: number;
  concluidas: number;
  emAnalise: number;
  naoIniciadas: number;
  comPendenciaOrgao: number;
  itens: { nome: string; confirmado: number; aguardando: number; naoAnalisado: number }[];
  porOrgao: { orgao: string; total: number; concluidas: number; pendDocs: number; pendKml: number; pendDup: number }[];
  porPessoa: { nome: string; concluidas: number; pendentes: number }[];
  desde: string;
  excluidasPendentes: number;
};

export type DadosSobreposicoes = {
  total: number;
  pendente: number;
  ok: number;
  problema: number;
  solucionado: number;
  porPessoa: { nome: string; ok: number; problema: number; solucionou: number }[];
  porOrgao: { orgao: string; problema: number; solucionado: number }[];
  observacoes: { status: string; ids: string; orgaos: string; responsavel: string; observacao: string; quando: string }[];
};

export type DadosTermos = {
  total: number;
  pendente: number;
  corrigido: number;
  problema: number;
  tei: number;
  rescisao: number;
  porOrgao: { orgao: string; total: number; pendentes: number }[];
};

export type DadosUnidadeVinculacao = {
  unidadeFila: number;
  unidadeAguardandoAprovacao: number;
  unidadeAprovadas: number;
  unidadeGravadas: number;
  unidadeFalhas: number;
  vincTentativas: number;
  vincSucesso: number;
  vincFalha: number;
  vincPorPessoa: { nome: string; sucesso: number; falha: number }[];
  unidadePorPessoa: { nome: string; aprovou: number; gravou: number }[];
};

export type DadosRelatorioPdf = {
  geradoEm: string;
  gestao: DadosGestao;
  novasAcoes: DadosNovasAcoes;
  sobreposicoes: DadosSobreposicoes;
  termos: DadosTermos;
  unidadeVinculacao: DadosUnidadeVinculacao;
  equipe: Desempenho | null;
};

const top = <T>(lista: T[], n: number) => lista.slice(0, n);

async function dadosGestao(admin: ReturnType<typeof createAdminClient>): Promise<DadosGestao> {
  const [{ data: resumoLista }, { data: statusRpc }] = await Promise.all([
    admin.rpc("dashboard_gestao_resumo", { data_corte: "2023-01-01" }),
    admin.rpc("dashboard_status_acoes", { data_corte: "2023-01-01", limite: 3 }),
  ]);
  const r = (resumoLista?.[0] ?? {}) as Record<string, number>;
  return {
    antes2023: Number(r.antes_corte ?? 0),
    total2023: Number(r.apos_corte_total ?? 0),
    vinculadas: Number(r.apos_corte_vinculadas ?? 0),
    pendentes: Number(r.apos_corte_pendentes ?? 0),
    semNumero: Number(r.apos_corte_sem_numero ?? 0),
    dadoIncorreto: Number(r.apos_corte_dado_incorreto ?? 0),
    orgaos: Number(r.apos_corte_orgaos_distintos ?? 0),
    status: ((statusRpc ?? []) as { status: string; total: number }[]).map((s) => ({ nome: s.status, valor: Number(s.total) })),
  };
}

async function dadosNovasAcoes(admin: ReturnType<typeof createAdminClient>, nomes: Map<string, string>): Promise<DadosNovasAcoes> {
  const [obrasTodas, revisoes] = await Promise.all([
    buscarTudo<{ id_acao: string; orgao: string | null; acao_conveniada: string | null }>((de, ate) =>
      admin
        .from("obras")
        .select("id_acao, orgao, acao_conveniada")
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
      responsavel_id: string | null;
      revisado_por: string | null;
    }>((de, ate) =>
      admin
        .from("obras_revisao")
        .select("id_acao, kml_anexado, sem_duplicacao, documentos_obrigatorios, concluido, responsavel_id, revisado_por")
        .order("id_acao")
        .range(de, ate)
    ),
  ]);
  const rev = new Map(revisoes.map((r) => [r.id_acao, r]));
  const obras = obrasTodas.filter((o) => !ehConveniada(o.acao_conveniada));

  const out: DadosNovasAcoes = {
    total: obras.length,
    concluidas: 0,
    emAnalise: 0,
    naoIniciadas: 0,
    comPendenciaOrgao: 0,
    itens: [
      { nome: "KML anexado", confirmado: 0, aguardando: 0, naoAnalisado: 0 },
      { nome: "Sem duplicação", confirmado: 0, aguardando: 0, naoAnalisado: 0 },
      { nome: "Documentos obrigatórios", confirmado: 0, aguardando: 0, naoAnalisado: 0 },
    ],
    porOrgao: [],
    porPessoa: [],
    desde: data(DATA_INICIO_REVISAO),
    excluidasPendentes: 0,
  };
  const orgaos = new Map<string, { total: number; concluidas: number; pendDocs: number; pendKml: number; pendDup: number }>();
  const pessoas = new Map<string, { concluidas: number; pendentes: number }>();

  for (const o of obras) {
    const r = rev.get(o.id_acao);
    const v = [r?.kml_anexado ?? "pendente", r?.sem_duplicacao ?? "pendente", r?.documentos_obrigatorios ?? "pendente"];
    const concluida = !!r?.concluido || v.every((x) => x === "confirmado");
    const laranja = v.includes("aguardando_atualizacao");
    const iniciada = v.some((x) => x !== "pendente");

    const og = orgaos.get(o.orgao ?? "Sem órgão") ?? { total: 0, concluidas: 0, pendDocs: 0, pendKml: 0, pendDup: 0 };
    orgaos.set(o.orgao ?? "Sem órgão", og);
    og.total++;

    if (concluida) {
      out.concluidas++;
      og.concluidas++;
    } else {
      if (iniciada) out.emAnalise++;
      else out.naoIniciadas++;
      if (laranja) out.comPendenciaOrgao++;
      v.forEach((st, i) => {
        if (st === "confirmado") out.itens[i].confirmado++;
        else if (st === "aguardando_atualizacao") out.itens[i].aguardando++;
        else out.itens[i].naoAnalisado++;
      });
      if (v[2] !== "confirmado") og.pendDocs++;
      if (v[0] !== "confirmado") og.pendKml++;
      if (v[1] !== "confirmado") og.pendDup++;
    }

    const dono = nomes.get(r?.responsavel_id ?? r?.revisado_por ?? "");
    if (dono && (concluida || iniciada)) {
      const p = pessoas.get(dono) ?? { concluidas: 0, pendentes: 0 };
      pessoas.set(dono, p);
      if (concluida) p.concluidas++;
      else p.pendentes++;
    }
  }

  const { data: excluidas } = await admin.rpc("novas_acoes_excluidas");
  out.excluidasPendentes = (excluidas ?? []).length;

  out.porOrgao = Array.from(orgaos.entries())
    .map(([orgao, x]) => ({ orgao, ...x }))
    .sort((a, b) => b.pendDocs - a.pendDocs || b.total - a.total);
  out.porPessoa = Array.from(pessoas.entries())
    .map(([nome, x]) => ({ nome, ...x }))
    .sort((a, b) => b.concluidas + b.pendentes - (a.concluidas + a.pendentes));
  return out;
}

async function dadosSobreposicoes(admin: ReturnType<typeof createAdminClient>, nomes: Map<string, string>): Promise<DadosSobreposicoes> {
  type Obra = { id?: string | null; orgao?: string | null };
  const locais = await buscarTudo<{
    obras: Obra[] | null;
    status: string;
    observacao: string | null;
    revisado_por: string | null;
    revisado_em: string | null;
    responsavel_id: string | null;
    solucionado_por: string | null;
    solucao: string | null;
  }>((de, ate) =>
    admin
      .from("sobreposicoes")
      .select("obras, status, observacao, revisado_por, revisado_em, responsavel_id, solucionado_por, solucao")
      .order("chave_local")
      .range(de, ate)
  );

  const out: DadosSobreposicoes = { total: locais.length, pendente: 0, ok: 0, problema: 0, solucionado: 0, porPessoa: [], porOrgao: [], observacoes: [] };
  const pessoas = new Map<string, { ok: number; problema: number; solucionou: number }>();
  const orgaos = new Map<string, { problema: number; solucionado: number }>();
  const pessoa = (n: string) => {
    const x = pessoas.get(n) ?? { ok: 0, problema: 0, solucionou: 0 };
    pessoas.set(n, x);
    return x;
  };
  const comObs: (DadosSobreposicoes["observacoes"][number] & { ordem: string })[] = [];

  for (const l of locais) {
    if (l.status === "ok") out.ok++;
    else if (l.status === "problema") out.problema++;
    else if (l.status === "solucionado") out.solucionado++;
    else out.pendente++;

    const dono = nomes.get(l.responsavel_id ?? l.revisado_por ?? "") ?? "";
    if (dono && l.status !== "pendente") {
      const p = pessoa(dono);
      if (l.status === "ok") p.ok++;
      else p.problema++;
    }
    if (l.status === "solucionado" && l.solucionado_por) {
      const s = nomes.get(l.solucionado_por);
      if (s) pessoa(s).solucionou++;
    }

    const obras = l.obras ?? [];
    const orgs = Array.from(new Set(obras.map((o) => (o.orgao ?? "").trim()).filter(Boolean)));
    if (l.status === "problema" || l.status === "solucionado") {
      for (const og of orgs) {
        const x = orgaos.get(og) ?? { problema: 0, solucionado: 0 };
        orgaos.set(og, x);
        if (l.status === "problema") x.problema++;
        else x.solucionado++;
      }
      if ((l.observacao ?? "").trim() && !/^Carregado automaticamente/.test(l.observacao ?? "")) {
        comObs.push({
          status: l.status === "problema" ? "Com problema" : "Solucionado",
          ids: obras.map((o) => o.id ?? "?").join(", "),
          orgaos: orgs.join(", "),
          responsavel: dono,
          observacao: (l.observacao ?? "").trim() + (l.status === "solucionado" && l.solucao ? " — Solução: " + l.solucao.trim() : ""),
          quando: dataHora(l.revisado_em),
          ordem: l.revisado_em ?? "",
        });
      }
    }
  }

  out.porPessoa = Array.from(pessoas.entries())
    .map(([nome, x]) => ({ nome, ...x }))
    .sort((a, b) => b.ok + b.problema - (a.ok + a.problema));
  out.porOrgao = Array.from(orgaos.entries())
    .map(([orgao, x]) => ({ orgao, ...x }))
    .sort((a, b) => b.problema + b.solucionado - (a.problema + a.solucionado));
  out.observacoes = comObs
    .sort((a, b) => (a.ordem < b.ordem ? 1 : -1))
    .slice(0, 12)
    .map(({ ordem: _ordem, ...resto }) => resto);
  return out;
}

async function dadosTermos(admin: ReturnType<typeof createAdminClient>): Promise<DadosTermos> {
  const [obras, revisoes] = await Promise.all([
    buscarTudo<{ id_acao: string; orgao: string | null; tipo_outros_documentos: string | null }>((de, ate) =>
      admin
        .from("obras")
        .select("id_acao, orgao, tipo_outros_documentos")
        .ilike("status", "conclu%")
        .or("tipo_outros_documentos.ilike.TERMO DE ENCERRAMENTO POR INATIVIDADE%,tipo_outros_documentos.ilike.TERMO DE RESCIS%")
        .order("id_acao")
        .range(de, ate)
    ),
    buscarTudo<{ id_acao: string; status: string }>((de, ate) => admin.from("obras_termos_revisao").select("id_acao, status").order("id_acao").range(de, ate)),
  ]);
  const rev = new Map(revisoes.map((r) => [r.id_acao, r.status]));
  const out: DadosTermos = { total: obras.length, pendente: 0, corrigido: 0, problema: 0, tei: 0, rescisao: 0, porOrgao: [] };
  const orgaos = new Map<string, { total: number; pendentes: number }>();
  for (const o of obras) {
    const st = rev.get(o.id_acao) ?? "pendente";
    if (st === "corrigido") out.corrigido++;
    else if (st === "problema") out.problema++;
    else out.pendente++;
    if ((o.tipo_outros_documentos ?? "").toUpperCase().startsWith("TERMO DE RESCIS")) out.rescisao++;
    else out.tei++;
    const x = orgaos.get(o.orgao ?? "Sem órgão") ?? { total: 0, pendentes: 0 };
    orgaos.set(o.orgao ?? "Sem órgão", x);
    x.total++;
    if (st !== "corrigido") x.pendentes++;
  }
  out.porOrgao = Array.from(orgaos.entries())
    .map(([orgao, x]) => ({ orgao, ...x }))
    .sort((a, b) => b.pendentes - a.pendentes || b.total - a.total);
  return out;
}

async function dadosUnidadeVinculacao(admin: ReturnType<typeof createAdminClient>, nomes: Map<string, string>): Promise<DadosUnidadeVinculacao> {
  const [sug, vinc] = await Promise.all([
    buscarTudo<{ id_acao: string; aprovado: boolean; aprovado_por: string | null; aplicado_em: string | null; aplicado_com_sucesso: boolean | null }>((de, ate) =>
      admin.from("obras_unidade_sugestao").select("id_acao, aprovado, aprovado_por, aplicado_em, aplicado_com_sucesso").order("id_acao").range(de, ate)
    ),
    buscarTudo<{ resultado: string; executado_por: string | null }>((de, ate) =>
      admin.from("obras_vinculacao_log").select("resultado, executado_por").order("id", { ascending: true }).range(de, ate)
    ),
  ]);
  // Mesmas regras das telas: o que "aguarda aprovação" é só o que o menu conta (ação de 2023
  // em diante que ainda não está concluída no SIMO); "aprovadas a gravar" é o que o admin
  // vê para gravar. Falha de gravação não marca aplicado_em: vem do último registro do log.
  const idsParaEscopo = sug.filter((x) => !x.aprovado && !x.aplicado_em).map((x) => x.id_acao);
  const idsAprovadasAbertas = sug.filter((x) => x.aprovado && !x.aplicado_em).map((x) => x.id_acao);
  const emEscopo = new Set<string>();
  for (let i = 0; i < idsParaEscopo.length; i += 400) {
    const { data: obrasEscopo } = await admin
      .from("obras")
      .select("id_acao, data_criacao, status")
      .in("id_acao", idsParaEscopo.slice(i, i + 400));
    for (const o of obrasEscopo ?? []) {
      const ano = o.data_criacao ? Number(String(o.data_criacao).slice(0, 4)) : 0;
      const concluida = ["concluído", "concluido"].includes(String(o.status ?? "").toLowerCase());
      if (ano >= 2023 && !concluida) emEscopo.add(o.id_acao as string);
    }
  }
  const ultimaTentativa = new Map<string, boolean>();
  for (let i = 0; i < idsAprovadasAbertas.length; i += 400) {
    const { data: tentativas } = await admin
      .from("obras_unidade_log")
      .select("id_acao, resultado, executado_em")
      .in("id_acao", idsAprovadasAbertas.slice(i, i + 400))
      .order("executado_em", { ascending: true });
    for (const t of tentativas ?? []) ultimaTentativa.set(t.id_acao as string, /^sucesso/i.test(String(t.resultado)));
  }
  const falhasUnidade = idsAprovadasAbertas.filter((id) => ultimaTentativa.get(id) === false).length;
  const aguardandoAprovacao = idsParaEscopo.filter((id) => emEscopo.has(id)).length;

  const out: DadosUnidadeVinculacao = {
    unidadeFila: aguardandoAprovacao + idsAprovadasAbertas.length,
    unidadeAguardandoAprovacao: aguardandoAprovacao,
    unidadeAprovadas: idsAprovadasAbertas.length - falhasUnidade,
    unidadeGravadas: sug.filter((x) => x.aplicado_em && x.aplicado_com_sucesso).length,
    unidadeFalhas: falhasUnidade,
    vincTentativas: vinc.length,
    vincSucesso: vinc.filter((v) => /^sucesso/i.test(v.resultado)).length,
    vincFalha: vinc.filter((v) => !/^sucesso/i.test(v.resultado)).length,
    vincPorPessoa: [],
    unidadePorPessoa: [],
  };
  const vp = new Map<string, { sucesso: number; falha: number }>();
  for (const v of vinc) {
    const n = nomes.get(v.executado_por ?? "");
    if (!n) continue;
    const x = vp.get(n) ?? { sucesso: 0, falha: 0 };
    vp.set(n, x);
    if (/^sucesso/i.test(v.resultado)) x.sucesso++;
    else x.falha++;
  }
  out.vincPorPessoa = Array.from(vp.entries()).map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.sucesso + b.falha - (a.sucesso + a.falha));
  const up = new Map<string, { aprovou: number; gravou: number }>();
  for (const s of sug) {
    const n = nomes.get(s.aprovado_por ?? "");
    if (!n) continue;
    const x = up.get(n) ?? { aprovou: 0, gravou: 0 };
    up.set(n, x);
    if (s.aprovado) x.aprovou++;
    if (s.aplicado_em && s.aplicado_com_sucesso) x.gravou++;
  }
  out.unidadePorPessoa = Array.from(up.entries()).map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.aprovou - a.aprovou);
  return out;
}

// userClient: as funções de desempenho conferem auth.uid() (só admin), então
// precisam rodar com a sessão da pessoa, não com a service_role.
export async function reunirDadosPdf(userClient: SupabaseClient, ehAdmin: boolean): Promise<DadosRelatorioPdf> {
  const admin = createAdminClient();
  const nomes = await nomesDePessoas(admin);
  const [gestao, novasAcoes, sobreposicoes, termos, unidadeVinculacao, equipeRpc] = await Promise.all([
    dadosGestao(admin),
    dadosNovasAcoes(admin, nomes),
    dadosSobreposicoes(admin, nomes),
    dadosTermos(admin),
    dadosUnidadeVinculacao(admin, nomes),
    ehAdmin ? userClient.rpc("desempenho_agregado", { data_de: null, data_ate: null }) : Promise.resolve({ data: null }),
  ]);
  return {
    geradoEm: dataHora(new Date().toISOString()),
    gestao,
    novasAcoes: { ...novasAcoes, porOrgao: top(novasAcoes.porOrgao, 8), porPessoa: top(novasAcoes.porPessoa, 10) },
    sobreposicoes: { ...sobreposicoes, porPessoa: top(sobreposicoes.porPessoa, 10), porOrgao: top(sobreposicoes.porOrgao, 8) },
    termos: { ...termos, porOrgao: top(termos.porOrgao, 8) },
    unidadeVinculacao,
    equipe: equipeRpc.data ? calcularDesempenho(equipeRpc.data as LinhaAgregada[]) : null,
  };
}

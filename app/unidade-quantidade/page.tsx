import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CardSugestaoUnidade } from "./CardSugestaoUnidade";
import { FiltrosUnidadeQuantidade } from "./FiltrosUnidadeQuantidade";
import { GrupoOrgaoPendencia } from "./GrupoOrgaoPendencia";
import { Paginacao } from "@/components/Paginacao";
import { AplicarUnidadeBotao } from "@/components/unidadeQuantidade/AplicarUnidadeBotao";
import { SincronizarBotao } from "@/components/admin/SincronizarBotao";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { contarSugestoesUnidadePendentes } from "@/lib/unidadeQuantidade";

const PAGE_SIZE = 50;
// Padrão pedido pelo usuário: ver só ações criadas de 2023 em diante,
// a não ser que ele escolha "todos os anos" no filtro.
const ANO_MINIMO_PADRAO = "2023";

type LinhaSugestao = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  tipologia: string | null;
  status_acao: string | null;
  unidade_atual: string | null;
  quantidade_atual: string | null;
  unidade_sugerida: string | null;
  quantidade_sugerida: string | null;
  sem_quantidade: boolean;
  unidade_final: string | null;
  quantidade_final: string | null;
  confianca: "alta" | "baixa";
  aviso_tipologia: boolean;
  motivo: string;
  aprovado: boolean;
  aplicado_em: string | null;
  pendencia_em?: string | null;
  pendencia_obs?: string | null;
  pendencia_por_nome?: string | null;
  total_geral: number;
};

export default async function UnidadeQuantidadePage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; confianca?: string; status?: string; anoMin?: string; tipologia?: string; eixo?: string; pagina?: string }>;
}) {
  const { busca, orgao, confianca, status, anoMin, tipologia, eixo, pagina } = await searchParams;
  const statusAtual = status || "pendentes";
  // anoMin=todos -> sem filtro; ausente -> padrão 2023; qualquer outro valor -> esse ano.
  const anoMinAtual = anoMin ?? ANO_MINIMO_PADRAO;
  const anoMinimoFiltro = anoMinAtual === "todos" ? null : parseInt(anoMinAtual, 10) || null;
  const paginaAtual = Math.max(1, parseInt(pagina ?? "1", 10) || 1);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    sugestoesUnidadePendentes,
    { count: sugestoesUnidadeAprovadas },
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: anosRpc },
    { data: tipologiasRpc },
    { data: eixosRpc },
    { count: totalPendencias },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    contarSugestoesUnidadePendentes(supabase),
    supabase.from("obras_unidade_sugestao").select("id_acao", { count: "exact", head: true }).eq("aprovado", true).is("aplicado_em", null),
    supabase.rpc("unidade_sugestao_lista", {
      busca: busca || null,
      orgao_filtro: orgao || null,
      confianca_filtro: confianca || null,
      filtro_status: statusAtual,
      ano_minimo: anoMinimoFiltro,
      tipologia_filtro: tipologia || null,
      // Só manda o eixo quando foi escolhido (o SQL 0094 cria este filtro).
      ...(eixo ? { eixo_filtro: eixo } : {}),
      pagina: paginaAtual,
      // Na aba Pendências vem tudo de uma vez (agrupado por órgão, sem paginar).
      tamanho: statusAtual === "pendencia" ? 2000 : PAGE_SIZE,
    }),
    supabase.rpc("unidade_sugestao_orgaos"),
    supabase.rpc("unidade_sugestao_anos"),
    supabase.rpc("unidade_sugestao_tipologias"),
    supabase.rpc("unidade_sugestao_eixos"),
    // Quantas estão em pendência (aba "Pendências"); sem o SQL 0095 a consulta falha e a aba só não mostra o número.
    supabase.from("obras_unidade_sugestao").select("id_acao", { count: "exact", head: true }).not("pendencia_em", "is", null).is("aplicado_em", null),
  ]);

  const linhas = (linhasRpc ?? []) as LinhaSugestao[];
  const totalGeral = linhas[0]?.total_geral ?? 0;
  const totalPaginas = statusAtual === "pendencia" ? 1 : Math.max(1, Math.ceil(totalGeral / PAGE_SIZE));
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);
  const anosDisponiveis = (anosRpc ?? []).map((r: { ano: number }) => r.ano);
  const tipologiasDisponiveis = (tipologiasRpc ?? []).map((r: { tipologia: string }) => r.tipologia);
  const eixosDisponiveis = (eixosRpc ?? []).map((r: { eixo: string }) => r.eixo);
  const isAdmin = !!profile?.is_admin;

  const cartao = (s: LinhaSugestao) => (
    <CardSugestaoUnidade
      key={s.id_acao}
      idAcao={s.id_acao}
      nomeAcao={s.nome_acao}
      orgao={s.orgao}
      tipologia={s.tipologia}
      statusAcao={s.status_acao}
      unidadeAtual={s.unidade_atual}
      quantidadeAtual={s.quantidade_atual}
      unidadeSugerida={s.unidade_sugerida}
      quantidadeSugerida={s.quantidade_sugerida}
      semQuantidade={s.sem_quantidade}
      unidadeFinal={s.unidade_final}
      quantidadeFinal={s.quantidade_final}
      confianca={s.confianca}
      avisoTipologia={s.aviso_tipologia}
      motivo={s.motivo}
      aprovado={s.aprovado}
      aplicadoEm={s.aplicado_em}
      pendenciaEm={s.pendencia_em ?? null}
      pendenciaObs={s.pendencia_obs ?? null}
      pendenciaPorNome={s.pendencia_por_nome ?? null}
    />
  );

  // Aba Pendências: um grupo por órgão (ordem alfabética).
  const gruposPendencia = Array.from(
    linhas.reduce((m, l) => {
      const k = l.orgao?.trim() || "Sem órgão";
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
      return m;
    }, new Map<string, LinhaSugestao[]>())
  ).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={isAdmin}
      counts={{
        acoes: totalAcoes ?? 0,
        pendentesAprovacao: pendentesAprovacao ?? 0,
        novasAcoesPendentes,
        sugestoesUnidadePendentes,
      }}
      titulo="Unidade / Quantidade"
      subtitulo={`${totalGeral} ação(ões), ${
        { pendentes: "aguardando revisão", pendencia: "em pendência (para analisar depois)", aprovadas: "aprovadas, aguardando gravação", aplicadas: "já aplicadas no SIMO", todas: "no total" }[
          statusAtual
        ] ?? "aguardando revisão"
      }`}
    >
      {(
        <div className="mb-4 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">Gravação no SIMO</h2>
            <SincronizarBotao apenasSugestoes />
          </div>
          <p className="mb-2 text-xs text-ink-muted">
            Aprove abaixo o que precisa ir pro SIMO e depois grave em lote aqui. "Recalcular sugestões" refaz a fila com as regras atuais, sem baixar do SIMO. Os dados novos do SIMO chegam pela sincronização, que roda todo dia{isAdmin ? ' (ou use "Sincronizar agora" no Admin)' : ""}.
          </p>
          <AplicarUnidadeBotao pendentes={sugestoesUnidadeAprovadas ?? 0} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href="/unidade-quantidade"
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${statusAtual !== "pendencia" ? "bg-series-1 text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"}`}
        >
          Análise
        </Link>
        <Link
          href="/unidade-quantidade?status=pendencia&anoMin=todos"
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${statusAtual === "pendencia" ? "bg-status-warning text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"}`}
        >
          Pendências <span className="tabular opacity-80">({totalPendencias ?? 0})</span>
        </Link>
      </div>

      <div className="mb-4">
        <FiltrosUnidadeQuantidade
          buscaAtual={busca ?? ""}
          orgaoAtual={orgao ?? ""}
          confiancaAtual={confianca ?? ""}
          orgaos={orgaosDisponiveis}
          statusAtual={statusAtual}
          anoMinAtual={anoMinAtual}
          anos={anosDisponiveis}
          tipologiaAtual={tipologia ?? ""}
          tipologias={tipologiasDisponiveis}
          eixoAtual={eixo ?? ""}
          eixos={eixosDisponiveis}
        />
      </div>

      <div className="space-y-3">
        {statusAtual === "pendencia"
          ? gruposPendencia.map(([nomeOrgao, itens]) => (
              <GrupoOrgaoPendencia key={nomeOrgao} orgao={nomeOrgao} quantidade={itens.length}>
                {itens.map(cartao)}
              </GrupoOrgaoPendencia>
            ))
          : linhas.map(cartao)}

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma sugestão pendente. 🎉</p>
          </div>
        )}

        <Paginacao
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          baseHref="/unidade-quantidade"
          params={{
            busca,
            orgao,
            confianca,
            tipologia,
            eixo,
            status: statusAtual !== "pendentes" ? statusAtual : undefined,
            anoMin: anoMinAtual !== ANO_MINIMO_PADRAO ? anoMinAtual : undefined,
          }}
        />
      </div>
    </AppShell>
  );
}

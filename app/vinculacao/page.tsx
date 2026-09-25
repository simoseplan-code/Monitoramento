import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CardPendenteVinculacao } from "./CardPendenteVinculacao";
import { FiltrosVinculacao } from "./FiltrosVinculacao";
import { Paginacao } from "@/components/Paginacao";
import { VincularBotao } from "@/components/vinculacao/VincularBotao";
import { SincronizarBotao } from "@/components/admin/SincronizarBotao";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { contarSugestoesUnidadePendentes } from "@/lib/unidadeQuantidade";
import { contarVinculacaoPendentes } from "@/lib/vinculacao";
import { CheckCircle2, XCircle } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

const PAGE_SIZE = 50;

type LinhaPendente = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  estagio_atual: string | null;
  status: string | null;
  numero_siafe: string;
  situacao: string | null;
  falhou_antes: boolean;
  total_geral: number;
};

export default async function VinculacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; pagina?: string }>;
}) {
  const { busca, orgao, pagina } = await searchParams;
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
    vinculacaoPendentes,
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: logRecente },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    contarSugestoesUnidadePendentes(supabase),
    contarVinculacaoPendentes(supabase),
    supabase.rpc("vinculacao_lista", { busca: busca || null, orgao_filtro: orgao || null, pagina: paginaAtual, tamanho: PAGE_SIZE }),
    supabase.rpc("vinculacao_orgaos"),
    supabase
      .from("obras_vinculacao_log")
      .select("id, id_acao, nome_acao, numero_siafe, resultado, executado_em, profiles(nome)")
      .order("executado_em", { ascending: false })
      .limit(20),
  ]);

  const linhas = (linhasRpc ?? []) as LinhaPendente[];
  const totalGeral = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalGeral / PAGE_SIZE));
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);
  const isAdmin = !!profile?.is_admin;

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
        vinculacaoPendentes,
      }}
      titulo="Vinculação SIAFE"
      subtitulo={`${totalGeral} ação(ões) pendentes de vinculação (com Número do Contrato no SIAFE, sem Número Automático)`}
    >
      {isAdmin && (
        <div className="mb-4 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">Vinculação no SIMO</h2>
            <SincronizarBotao />
          </div>
          <p className="mb-2 text-xs text-ink-muted">
            Vincula de uma vez todas as ações com Número do Contrato no SIAFE válido (8 dígitos). As com situação abaixo precisam de correção manual antes.
            Sincronize antes se a base estiver desatualizada (o cron também roda automático todo dia).
          </p>
          <VincularBotao pendentes={vinculacaoPendentes} />
        </div>
      )}

      <div className="mb-4">
        <FiltrosVinculacao buscaAtual={busca ?? ""} orgaoAtual={orgao ?? ""} orgaos={orgaosDisponiveis} />
      </div>

      <div className="space-y-3">
        {linhas.map((l) => (
          <CardPendenteVinculacao
            key={l.id_acao}
            idAcao={l.id_acao}
            nomeAcao={l.nome_acao}
            orgao={l.orgao}
            estagioAtual={l.estagio_atual}
            status={l.status}
            numeroSiafe={l.numero_siafe}
            situacao={l.situacao}
            falhouAntes={l.falhou_antes}
            isAdmin={isAdmin}
          />
        ))}

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma ação pendente de vinculação. 🎉</p>
          </div>
        )}

        <Paginacao paginaAtual={paginaAtual} totalPaginas={totalPaginas} baseHref="/vinculacao" params={{ busca, orgao }} />
      </div>

      {isAdmin && (
        <div className="mt-6 rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Histórico recente de vinculação</h2>
          <ul className="space-y-2">
            {(logRecente ?? []).map((l) => {
              const sucesso = l.resultado === "Sucesso";
              const nomeExecutor = (l as unknown as { profiles: { nome: string } | null }).profiles?.nome ?? "Desconhecido";
              return (
                <li key={l.id} className="flex items-start gap-2 text-sm">
                  {sucesso ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-good" />
                  ) : (
                    <XCircle size={16} className="mt-0.5 shrink-0 text-status-critical" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-ink-secondary">
                      <IdAcaoLink id={l.id_acao} /> · {l.nome_acao} — SIAFE {l.numero_siafe}
                      {sucesso ? "" : `: ${l.resultado}`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {nomeExecutor} · {new Date(l.executado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </li>
              );
            })}
            {(!logRecente || logRecente.length === 0) && <li className="text-sm text-ink-muted">Nenhuma tentativa registrada ainda.</li>}
          </ul>
        </div>
      )}
    </AppShell>
  );
}

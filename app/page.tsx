import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { LazyVinculacaoDonut } from "@/components/dashboard/LazyVinculacaoDonut";
import { WorkflowColumns } from "@/components/dashboard/WorkflowColumns";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { NotificationsFeed } from "@/components/dashboard/NotificationsFeed";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { ClipboardList, Building2, Link2, Clock3, AlertTriangle, Archive } from "lucide-react";

const DATA_CORTE = "2023-01-01";

// Cor de cada status do SIMO; o que não é conhecido fica neutro.
function estiloStatus(status: string) {
  const s = status.toLowerCase();
  if (s.startsWith("conclu")) return { cor: "var(--status-good)", corFundo: "var(--status-good-bg)" };
  if (s.includes("desenvolvimento")) return { cor: "var(--series-1)", corFundo: "rgb(42 120 214 / 0.1)" };
  if (s.startsWith("cancel")) return { cor: "var(--status-critical)", corFundo: "var(--status-critical-bg)" };
  if (s.includes("paralis")) return { cor: "var(--status-warning)", corFundo: "var(--status-warning-bg)" };
  return { cor: "var(--status-neutral)", corFundo: "var(--status-neutral-bg)" };
}

export default async function DashboardGestaoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: resumoLista },
    { data: statusRpc },
    { data: syncLogs },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    // Uma função SQL só: separa o que é anterior a 2023 (informativo,
    // fora da análise) do que é 2023 em diante (esse sim é analisado).
    supabase.rpc("dashboard_gestao_resumo", { data_corte: DATA_CORTE }),
    supabase.rpc("dashboard_status_acoes", { data_corte: DATA_CORTE, limite: 3 }),
    supabase.from("sync_log").select("id, sucesso, linhas_processadas, mensagem, executado_em").order("executado_em", { ascending: false }).limit(5),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
  ]);

  const resumo = resumoLista?.[0] ?? {
    antes_corte: 0,
    sem_data: 0,
    apos_corte_total: 0,
    apos_corte_vinculadas: 0,
    apos_corte_pendentes: 0,
    apos_corte_sem_numero: 0,
    apos_corte_dado_incorreto: 0,
    apos_corte_orgaos_distintos: 0,
  };
  // Status da ação no SIMO (2023 em diante), do maior pro menor.
  const statusLinhas = (statusRpc ?? []) as { status: string; total: number; top_orgaos: string[] | null }[];
  const totalStatus = statusLinhas.reduce((acc, l) => acc + Number(l.total), 0);
  const colunasStatus = statusLinhas.map((l) => ({
    chave: l.status,
    titulo: l.status,
    valor: Number(l.total),
    total: totalStatus,
    ...estiloStatus(l.status),
    topOrgaos: l.top_orgaos ?? [],
    ajuda: `Ações com o status "${l.status}" no SIMO, criadas de 2023 em diante.`,
  }));

  const eventos = (syncLogs ?? []).map((s) => ({
    id: String(s.id),
    tipo: (s.sucesso ? "sync_ok" : "sync_erro") as "sync_ok" | "sync_erro",
    texto: s.sucesso ? `Sincronização concluída: ${s.linhas_processadas} ações.` : `Falha na sincronização: ${s.mensagem}`,
    quando: new Date(s.executado_em).toLocaleString("pt-BR"),
  }));

  const totalGeral = resumo.antes_corte + resumo.sem_data + resumo.apos_corte_total;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalGeral, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Dashboard Gestão"
      subtitulo="Visão geral por período — ações de 2023 em diante entram na análise de status"
      notificacoesCount={eventos.filter((e) => e.tipo === "sync_erro").length}
    >
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Archive} label="Criadas antes de 2023" value={resumo.antes_corte} tint="neutral" ajuda="Ações cadastradas no SIMO antes de 2023. Ficam fora de todos os indicadores desta tela; são contadas aqui só pra você saber quantas são." />
        <StatCard icon={ClipboardList} label="Criadas a partir de 2023" value={resumo.apos_corte_total} tint="series-1" ajuda="Total de ações cadastradas de 01/01/2023 em diante. É a base de todos os indicadores desta tela." />
        <StatCard icon={Building2} label="Órgãos (2023+)" value={resumo.apos_corte_orgaos_distintos} tint="neutral" ajuda="Quantos órgãos diferentes têm pelo menos uma ação criada de 2023 em diante." />
        <StatCard icon={Link2} label="Vinculadas (2023+)" value={resumo.apos_corte_vinculadas} tint="good" ajuda="Ações que já têm o Número Automático, ou seja, o contrato do SIAFE já foi vinculado no SIMO." />
        <StatCard icon={Clock3} label="Pendentes (2023+)" value={resumo.apos_corte_pendentes} tint="warning" ajuda="Ações que já têm o Número do Contrato no SIAFE informado, mas ainda não foram vinculadas (sem Número Automático). É o trabalho da tela Vinculação SIAFE." />
        <StatCard icon={AlertTriangle} label="Dado incorreto (2023+)" value={resumo.apos_corte_dado_incorreto} tint="critical" ajuda="Ações com Número do Contrato no SIAFE preenchido, mas sem exatamente 8 dígitos. Precisam de correção manual antes de poderem ser vinculadas." />
      </section>

      <p className="mb-6 text-xs text-ink-muted">
        {resumo.antes_corte} ações criadas antes de 2023 não entram nos indicadores abaixo
        {resumo.sem_data > 0 ? ` · ${resumo.sem_data} sem data de criação informada` : ""}.
      </p>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <LazyVinculacaoDonut
            vinculadas={resumo.apos_corte_vinculadas}
            pendentes={resumo.apos_corte_pendentes}
            semNumero={resumo.apos_corte_sem_numero}
          />
        </div>
        <div className="lg:col-span-2">
          <QuickActions isAdmin={!!profile?.is_admin} pendentesAprovacao={pendentesAprovacao ?? 0} />
        </div>
      </section>

      <section className="mb-6">
        <WorkflowColumns colunas={colunasStatus} />
      </section>

      <section>
        <NotificationsFeed eventos={eventos} />
      </section>
    </AppShell>
  );
}

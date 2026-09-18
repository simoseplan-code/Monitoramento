import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { VinculacaoDonut } from "@/components/dashboard/VinculacaoDonut";
import { HistoricoChart } from "@/components/dashboard/HistoricoChart";
import { WorkflowColumns } from "@/components/dashboard/WorkflowColumns";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { NotificationsFeed } from "@/components/dashboard/NotificationsFeed";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { ClipboardList, Building2, Link2, Clock3, AlertTriangle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

async function topOrgaos(supabase: SupabaseClient, bucket: string): Promise<string[]> {
  const { data } = await supabase.rpc("obras_top_orgaos", { bucket, limite: 3 });
  return (data ?? []).map((r: { orgao: string }) => r.orgao);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: resumoLista },
    { data: historico },
    { data: syncLogs },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    topSemNumero,
    topPendente,
    topDadoIncorreto,
    topVinculada,
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    // Uma única função SQL soma tudo no banco — nada de baixar as 13k+
    // linhas de "obras" pro Next.js só pra contar em JavaScript.
    supabase.rpc("obras_resumo"),
    supabase
      .from("obras_historico")
      .select("registrado_em, total, vinculadas, pendentes")
      .order("registrado_em", { ascending: true })
      .limit(30),
    supabase.from("sync_log").select("id, sucesso, linhas_processadas, mensagem, executado_em").order("executado_em", { ascending: false }).limit(5),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    topOrgaos(supabase, "sem_numero"),
    topOrgaos(supabase, "pendente"),
    topOrgaos(supabase, "dado_incorreto"),
    topOrgaos(supabase, "vinculada"),
  ]);

  const resumo = resumoLista?.[0] ?? {
    total: 0,
    vinculadas: 0,
    pendentes: 0,
    sem_numero: 0,
    dado_incorreto: 0,
    orgaos_distintos: 0,
  };

  const pontosHistorico = (historico ?? []).map((h) => ({
    data: new Date(h.registrado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    total: h.total,
    vinculadas: h.vinculadas,
    pendentes: h.pendentes,
  }));

  const eventos = (syncLogs ?? []).map((s) => ({
    id: String(s.id),
    tipo: (s.sucesso ? "sync_ok" : "sync_erro") as "sync_ok" | "sync_erro",
    texto: s.sucesso ? `Sincronização concluída: ${s.linhas_processadas} ações.` : `Falha na sincronização: ${s.mensagem}`,
    quando: new Date(s.executado_em).toLocaleString("pt-BR"),
  }));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: resumo.total, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Dashboard"
      subtitulo="Visão geral do monitoramento de obras"
      notificacoesCount={eventos.filter((e) => e.tipo === "sync_erro").length}
    >
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ClipboardList} label="Total de ações" value={resumo.total} tint="series-1" />
        <StatCard icon={Building2} label="Órgãos" value={resumo.orgaos_distintos} tint="neutral" />
        <StatCard icon={Link2} label="Vinculadas" value={resumo.vinculadas} tint="good" />
        <StatCard icon={Clock3} label="Pendentes" value={resumo.pendentes} tint="warning" />
        <StatCard icon={ClipboardList} label="Sem número" value={resumo.sem_numero} tint="neutral" />
        <StatCard icon={AlertTriangle} label="Dado incorreto" value={resumo.dado_incorreto} tint="critical" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <VinculacaoDonut vinculadas={resumo.vinculadas} pendentes={resumo.pendentes} semNumero={resumo.sem_numero} />
        </div>
        <div className="lg:col-span-2">
          <HistoricoChart pontos={pontosHistorico} />
        </div>
      </section>

      <section className="mb-6">
        <WorkflowColumns
          colunas={[
            {
              chave: "sem_numero",
              titulo: "Sem número",
              valor: resumo.sem_numero,
              total: resumo.total,
              cor: "var(--status-neutral)",
              corFundo: "var(--status-neutral-bg)",
              topOrgaos: topSemNumero,
            },
            {
              chave: "pendente",
              titulo: "Pendentes",
              valor: resumo.pendentes,
              total: resumo.total,
              cor: "var(--status-warning)",
              corFundo: "var(--status-warning-bg)",
              topOrgaos: topPendente,
            },
            {
              chave: "dado_incorreto",
              titulo: "Dado incorreto",
              valor: resumo.dado_incorreto,
              total: resumo.total,
              cor: "var(--status-critical)",
              corFundo: "var(--status-critical-bg)",
              topOrgaos: topDadoIncorreto,
            },
            {
              chave: "vinculada",
              titulo: "Vinculadas",
              valor: resumo.vinculadas,
              total: resumo.total,
              cor: "var(--status-good)",
              corFundo: "var(--status-good-bg)",
              topOrgaos: topVinculada,
            },
          ]}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuickActions isAdmin={!!profile?.is_admin} pendentesAprovacao={pendentesAprovacao ?? 0} />
        <NotificationsFeed eventos={eventos} />
      </section>
    </AppShell>
  );
}

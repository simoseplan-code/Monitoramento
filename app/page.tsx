import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { VinculacaoDonut } from "@/components/dashboard/VinculacaoDonut";
import { HistoricoChart } from "@/components/dashboard/HistoricoChart";
import { WorkflowColumns } from "@/components/dashboard/WorkflowColumns";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { NotificationsFeed } from "@/components/dashboard/NotificationsFeed";
import { ClipboardList, Building2, Link2, Clock3, AlertTriangle } from "lucide-react";

type ObraResumo = {
  numero_automatico: string | null;
  numero_siafe: string | null;
  orgao: string | null;
};

function classificar(r: ObraResumo) {
  if (r.numero_automatico) return "vinculada" as const;
  if (r.numero_siafe) return "pendente" as const;
  return "sem_numero" as const;
}

function siafeValido(numero: string | null) {
  return !!numero && /^\d{8}$/.test(numero.trim());
}

function topOrgaos(linhas: ObraResumo[], n = 3): string[] {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    if (!l.orgao) continue;
    contagem.set(l.orgao, (contagem.get(l.orgao) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([nome]) => nome);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: obras }, { data: historico }, { data: syncLogs }, { count: pendentesAprovacao }] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("obras").select("numero_automatico, numero_siafe, orgao"),
      supabase
        .from("obras_historico")
        .select("registrado_em, total, vinculadas, pendentes")
        .order("registrado_em", { ascending: true })
        .limit(30),
      supabase.from("sync_log").select("id, sucesso, linhas_processadas, mensagem, executado_em").order("executado_em", { ascending: false }).limit(5),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    ]);

  const linhas = obras ?? [];
  const total = linhas.length;
  const vinculadas = linhas.filter((r) => classificar(r) === "vinculada");
  const pendentes = linhas.filter((r) => classificar(r) === "pendente");
  const semNumero = linhas.filter((r) => classificar(r) === "sem_numero");
  const dadoIncorreto = linhas.filter((r) => r.numero_siafe && !siafeValido(r.numero_siafe));
  const orgaosDistintos = new Set(linhas.map((r) => r.orgao).filter(Boolean)).size;

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
      counts={{ acoes: total, pendentesAprovacao: pendentesAprovacao ?? 0 }}
      titulo="Dashboard"
      subtitulo="Visão geral do monitoramento de obras"
      notificacoesCount={eventos.filter((e) => e.tipo === "sync_erro").length}
    >
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ClipboardList} label="Total de ações" value={total} tint="series-1" />
        <StatCard icon={Building2} label="Órgãos" value={orgaosDistintos} tint="neutral" />
        <StatCard icon={Link2} label="Vinculadas" value={vinculadas.length} tint="good" />
        <StatCard icon={Clock3} label="Pendentes" value={pendentes.length} tint="warning" />
        <StatCard icon={ClipboardList} label="Sem número" value={semNumero.length} tint="neutral" />
        <StatCard icon={AlertTriangle} label="Dado incorreto" value={dadoIncorreto.length} tint="critical" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <VinculacaoDonut vinculadas={vinculadas.length} pendentes={pendentes.length} semNumero={semNumero.length} />
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
              valor: semNumero.length,
              total,
              cor: "var(--status-neutral)",
              corFundo: "var(--status-neutral-bg)",
              topOrgaos: topOrgaos(semNumero),
            },
            {
              chave: "pendente",
              titulo: "Pendentes",
              valor: pendentes.length,
              total,
              cor: "var(--status-warning)",
              corFundo: "var(--status-warning-bg)",
              topOrgaos: topOrgaos(pendentes),
            },
            {
              chave: "dado_incorreto",
              titulo: "Dado incorreto",
              valor: dadoIncorreto.length,
              total,
              cor: "var(--status-critical)",
              corFundo: "var(--status-critical-bg)",
              topOrgaos: topOrgaos(dadoIncorreto),
            },
            {
              chave: "vinculada",
              titulo: "Vinculadas",
              valor: vinculadas.length,
              total,
              cor: "var(--status-good)",
              corFundo: "var(--status-good-bg)",
              topOrgaos: topOrgaos(vinculadas),
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

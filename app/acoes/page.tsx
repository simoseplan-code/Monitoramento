import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosAcoes } from "./FiltrosAcoes";

type Obra = {
  id_acao: string;
  nome_acao: string;
  numero_automatico: string | null;
  numero_siafe: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
};

function classificar(r: Obra) {
  if (r.numero_automatico) return "vinculada" as const;
  if (r.numero_siafe) return "pendente" as const;
  return "sem_numero" as const;
}

function siafeValido(numero: string | null) {
  return !!numero && /^\d{8}$/.test(numero.trim());
}

const BADGES: Record<string, string> = {
  vinculada: "bg-status-good-bg text-status-good",
  pendente: "bg-status-warning-bg text-status-warning",
  sem_numero: "bg-status-neutral-bg text-status-neutral",
};

const LABELS: Record<string, string> = {
  vinculada: "Vinculada",
  pendente: "Pendente",
  sem_numero: "Sem número",
};

export default async function AcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; filtro?: string }>;
}) {
  const { busca, filtro } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: pendentesAprovacao }] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);

  let query = supabase
    .from("obras")
    .select("id_acao, nome_acao, numero_automatico, numero_siafe, orgao, status, estagio_atual")
    .order("nome_acao");

  if (busca) {
    query = query.or(`nome_acao.ilike.%${busca}%,id_acao.ilike.%${busca}%,orgao.ilike.%${busca}%`);
  }

  const { data: obras } = await query;
  let linhas = obras ?? [];

  if (filtro === "pendente") linhas = linhas.filter((r) => classificar(r) === "pendente");
  else if (filtro === "vinculada") linhas = linhas.filter((r) => classificar(r) === "vinculada");
  else if (filtro === "sem_numero") linhas = linhas.filter((r) => classificar(r) === "sem_numero");
  else if (filtro === "dado_incorreto") linhas = linhas.filter((r) => r.numero_siafe && !siafeValido(r.numero_siafe));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: obras?.length ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0 }}
      titulo="Ações"
      subtitulo={`${linhas.length} de ${obras?.length ?? 0} ações`}
    >
      <div className="rounded-xl border border-black/5 bg-surface shadow-card">
        <FiltrosAcoes buscaAtual={busca ?? ""} filtroAtual={filtro ?? ""} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Nome da ação</th>
                <th className="px-4 py-3">Órgão</th>
                <th className="px-4 py-3">Nº SIAFE</th>
                <th className="px-4 py-3">Estágio</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => {
                const st = classificar(r);
                return (
                  <tr key={r.id_acao} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
                    <td className="tabular px-4 py-3 font-medium text-ink-primary">{r.id_acao}</td>
                    <td className="px-4 py-3 text-ink-secondary">{r.nome_acao}</td>
                    <td className="px-4 py-3 text-ink-secondary">{r.orgao}</td>
                    <td className={`px-4 py-3 ${r.numero_siafe && !siafeValido(r.numero_siafe) ? "font-medium text-status-critical" : "text-ink-secondary"}`}>
                      {r.numero_siafe ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{r.estagio_atual ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[st]}`}>{LABELS[st]}</span>
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-muted">
                    Nenhuma ação encontrada com esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

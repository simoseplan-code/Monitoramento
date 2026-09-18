import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";

type LinhaOrgao = { orgao: string; total: number; vinculadas: number; pendentes: number };

export default async function OrgaosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: porOrgao }, { count: totalGeral }, { count: pendentesAprovacao }, novasAcoesPendentes] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      // Já agrupado no banco (função obras_por_orgao) — em vez de baixar
      // as 13k+ linhas de "obras" só pra somar por órgão em JavaScript.
      supabase.rpc("obras_por_orgao"),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      contarNovasAcoesPendentes(supabase),
    ]);

  const linhas = (porOrgao ?? []) as LinhaOrgao[];

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalGeral ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Órgãos"
      subtitulo={`${linhas.length} órgãos com ações cadastradas`}
    >
      <div className="rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Órgão</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Vinculadas</th>
              <th className="px-4 py-3">Pendentes</th>
              <th className="px-4 py-3">Progresso</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => {
              const pct = r.total > 0 ? Math.round((r.vinculadas / r.total) * 100) : 0;
              return (
                <tr key={r.orgao} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
                  <td className="px-4 py-3 font-medium text-ink-primary">
                    <Link href={`/acoes?busca=${encodeURIComponent(r.orgao)}`} className="hover:underline">
                      {r.orgao}
                    </Link>
                  </td>
                  <td className="tabular px-4 py-3 text-ink-secondary">{r.total}</td>
                  <td className="tabular px-4 py-3 text-status-good">{r.vinculadas}</td>
                  <td className="tabular px-4 py-3 text-status-warning">{r.pendentes}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-plane">
                        <div className="h-full rounded-full bg-status-good" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular text-xs text-ink-muted">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                  Nenhum dado sincronizado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

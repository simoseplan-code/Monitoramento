import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { LazyHistoricoChart } from "@/components/dashboard/LazyHistoricoChart";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";

export default async function HistoricoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: historico }] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      contarNovasAcoesPendentes(supabase),
      supabase
        .from("obras_historico")
        .select("id, registrado_em, total, vinculadas, pendentes, dado_incorreto")
        .order("registrado_em", { ascending: false }),
    ]);

  const linhas = historico ?? [];
  const pontosGrafico = [...linhas]
    .reverse()
    .map((h) => ({
      data: new Date(h.registrado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      total: h.total,
      vinculadas: h.vinculadas,
      pendentes: h.pendentes,
    }));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Histórico"
      subtitulo="Evolução da vinculação a cada sincronização com o SIMO"
    >
      <div className="mb-6">
        <LazyHistoricoChart pontos={pontosGrafico} />
      </div>

      <div className="rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Data/Hora</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Vinculadas</th>
              <th className="px-4 py-3">Pendentes</th>
              <th className="px-4 py-3">% Vinculado</th>
              <th className="px-4 py-3">Dado incorreto</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((h) => {
              const pct = h.total > 0 ? (h.vinculadas / h.total) * 100 : 0;
              return (
                <tr key={h.id} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
                  <td className="tabular px-4 py-3 text-ink-secondary">
                    {new Date(h.registrado_em).toLocaleString("pt-BR")}
                  </td>
                  <td className="tabular px-4 py-3 font-medium text-ink-primary">{h.total}</td>
                  <td className="tabular px-4 py-3 text-status-good">{h.vinculadas}</td>
                  <td className="tabular px-4 py-3 text-status-warning">{h.pendentes}</td>
                  <td className="tabular px-4 py-3 text-ink-secondary">{pct.toFixed(1)}%</td>
                  <td className="tabular px-4 py-3 text-status-critical">{h.dado_incorreto}</td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-muted">
                  Nenhum retrato registrado ainda — aparece um a cada sincronização com o SIMO.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

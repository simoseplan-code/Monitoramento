import { redirect } from "next/navigation";
import { ShieldCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { AprovarBotoes } from "./AprovarBotoes";

type Membro = {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  is_admin: boolean;
  approved_at: string | null;
  created_at: string;
};

export default async function EquipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: pendentes }, { data: ativos }, { count: totalAcoes }, novasAcoesPendentes] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("profiles").select("id, nome, email, created_at").eq("status", "pendente").order("created_at"),
      supabase
        .from("profiles")
        .select("id, nome, email, cargo, is_admin, approved_at, created_at")
        .eq("status", "aprovado")
        .order("is_admin", { ascending: false })
        .order("nome"),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      contarNovasAcoesPendentes(supabase),
    ]);

  if (!profile?.is_admin) redirect("/");

  const membros = (ativos ?? []) as Membro[];
  const qtdAdmins = membros.filter((m) => m.is_admin).length;

  return (
    <AppShell
      nome={profile.nome ?? "Usuário"}
      cargo={profile.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentes?.length ?? 0, novasAcoesPendentes }}
      titulo="Equipe"
      subtitulo={`${membros.length} pessoa(s) ativa(s) · ${qtdAdmins} administrador(es)`}
    >
      {pendentes && pendentes.length > 0 && (
        <section className="mb-4 rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">
            Cadastros pendentes de aprovação
            <span className="ml-2 rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-semibold text-status-warning">
              {pendentes.length}
            </span>
          </h2>
          <div className="space-y-2">
            {pendentes.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-black/5 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{p.nome}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {p.email} · cadastro em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <AprovarBotoes userId={p.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Pessoas ativas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Cargo</th>
                <th className="px-3 py-2">Função</th>
                <th className="px-3 py-2 text-right">Ativo desde</th>
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink-primary">
                    {m.nome}
                    {m.id === user!.id && <span className="ml-2 text-xs font-normal text-ink-muted">(você)</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{m.email}</td>
                  <td className="px-3 py-2 text-ink-secondary">{m.cargo || "—"}</td>
                  <td className="px-3 py-2">
                    {m.is_admin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-series-1/10 px-2.5 py-0.5 text-xs font-semibold text-series-1">
                        <ShieldCheck size={12} /> Administrador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-status-neutral">
                        <User size={12} /> Equipe
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-ink-secondary">
                    {new Date(m.approved_at ?? m.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {membros.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-ink-muted">
                    Nenhuma pessoa ativa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

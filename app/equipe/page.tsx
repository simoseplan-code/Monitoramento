import { redirect } from "next/navigation";
import { ShieldCheck, User, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { AprovarBotoes } from "./AprovarBotoes";
import { PapelSelect } from "./PapelSelect";

type Membro = {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  papel: string;
  approved_at: string | null;
  created_at: string;
};

const BADGE: Record<string, { rotulo: string; classe: string; Icone: typeof User }> = {
  admin: { rotulo: "Administrador", classe: "bg-series-1/10 text-series-1", Icone: ShieldCheck },
  chefe: { rotulo: "Chefe", classe: "bg-series-7/10 text-series-7", Icone: UserCog },
  equipe: { rotulo: "Equipe", classe: "bg-status-neutral-bg text-status-neutral", Icone: User },
};

export default async function EquipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: pendentes }, { data: ativos }, { count: totalAcoes }, novasAcoesPendentes] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin, papel").eq("id", user!.id).single(),
      supabase.from("profiles").select("id, nome, email, created_at").eq("status", "pendente").order("created_at"),
      supabase
        .from("profiles")
        .select("id, nome, email, cargo, papel, approved_at, created_at")
        .eq("status", "aprovado")
        .order("nome"),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      contarNovasAcoesPendentes(supabase),
    ]);

  // Admin e chefe veem a lista; só o administrador altera acesso.
  if (!profile?.is_admin) redirect("/");
  const souAdmin = profile.papel === "admin";

  const ordem: Record<string, number> = { admin: 0, chefe: 1, equipe: 2 };
  const membros = ((ativos ?? []) as Membro[]).sort((a, b) => (ordem[a.papel] ?? 3) - (ordem[b.papel] ?? 3) || a.nome.localeCompare(b.nome));
  const qtd = (p: string) => membros.filter((m) => m.papel === p).length;

  return (
    <AppShell
      nome={profile.nome ?? "Usuário"}
      cargo={profile.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentes?.length ?? 0, novasAcoesPendentes }}
      titulo="Equipe"
      subtitulo={`${membros.length} pessoa(s) ativa(s) · ${qtd("admin")} administrador(es) · ${qtd("chefe")} chefe(s) · ${qtd("equipe")} equipe`}
    >
      <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(["admin", "chefe", "equipe"] as const).map((p) => {
          const b = BADGE[p];
          const texto =
            p === "admin"
              ? "Vê e faz tudo. É o único que aprova cadastros e altera a função das pessoas."
              : p === "chefe"
                ? "Vê e faz tudo igual ao administrador, menos alterar acesso. Acessa Sobreposições, Desempenho, Relatórios e Administração."
                : "Acesso às análises do dia a dia. Sem Sobreposições, Desempenho, Relatórios e Administração (por enquanto).";
          return (
            <div key={p} className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.classe}`}>
                <b.Icone size={12} /> {b.rotulo}
              </span>
              <p className="mt-2 text-xs text-ink-muted">{texto}</p>
            </div>
          );
        })}
      </section>

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
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{p.nome}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {p.email} · cadastro em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {souAdmin ? <AprovarBotoes userId={p.id} /> : <span className="text-xs text-ink-muted">Só o administrador aprova.</span>}
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
              {membros.map((m) => {
                const b = BADGE[m.papel] ?? BADGE.equipe;
                const euMesmo = m.id === user!.id;
                return (
                  <tr key={m.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink-primary">
                      {m.nome}
                      {euMesmo && <span className="ml-2 text-xs font-normal text-ink-muted">(você)</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{m.email}</td>
                    <td className="px-3 py-2 text-ink-secondary">{m.cargo || "-"}</td>
                    <td className="px-3 py-2">
                      {souAdmin && !euMesmo ? (
                        <PapelSelect userId={m.id} papelAtual={m.papel} />
                      ) : (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.classe}`}>
                          <b.Icone size={12} /> {b.rotulo}
                        </span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink-secondary">
                      {new Date(m.approved_at ?? m.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
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
        {!souAdmin && <p className="mt-3 text-xs text-ink-muted">Você pode ver a equipe, mas só o administrador altera acessos.</p>}
      </section>
    </AppShell>
  );
}

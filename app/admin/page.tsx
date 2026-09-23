import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { AprovarBotoes } from "./AprovarBotoes";
import { SincronizarBotao } from "./SincronizarBotao";
import { AplicarUnidadeBotao } from "@/components/unidadeQuantidade/AplicarUnidadeBotao";
import { CheckCircle2, XCircle } from "lucide-react";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: pendentes },
    { data: ultimosSyncs },
    { count: totalAcoes },
    novasAcoesPendentes,
    { count: sugestoesUnidadeAprovadas },
    { data: unidadeLogRecente },
    { data: unidadeProdutividade },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("profiles").select("id, nome, email, created_at").eq("status", "pendente").order("created_at"),
    supabase
      .from("sync_log")
      .select("id, executado_em, sucesso, linhas_processadas, mensagem")
      .order("executado_em", { ascending: false })
      .limit(6),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    contarNovasAcoesPendentes(supabase),
    supabase.from("obras_unidade_sugestao").select("id_acao", { count: "exact", head: true }).eq("aprovado", true).is("aplicado_em", null),
    supabase
      .from("obras_unidade_log")
      .select("id, id_acao, nome_acao, unidade_antiga, unidade_nova, resultado, executado_em, profiles(nome)")
      .order("executado_em", { ascending: false })
      .limit(20),
    supabase.rpc("unidade_log_produtividade"),
  ]);

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentes?.length ?? 0, novasAcoesPendentes }}
      titulo="Administração"
      subtitulo="Sincronização, cadastros e auditoria"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">Sincronização com o SIMO</h2>
            <SincronizarBotao />
          </div>
          <ul className="space-y-2">
            {(ultimosSyncs ?? []).map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm">
                {s.sucesso ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-good" />
                ) : (
                  <XCircle size={16} className="mt-0.5 shrink-0 text-status-critical" />
                )}
                <div className="min-w-0">
                  <p className="text-ink-secondary">
                    {s.sucesso ? `${s.linhas_processadas} ações sincronizadas` : s.mensagem}
                  </p>
                  <p className="text-xs text-ink-muted">{new Date(s.executado_em).toLocaleString("pt-BR")}</p>
                </div>
              </li>
            ))}
            {(!ultimosSyncs || ultimosSyncs.length === 0) && (
              <li className="text-sm text-ink-muted">Nenhuma sincronização registrada ainda.</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Unidade/Quantidade — gravação no SIMO</h2>
          <p className="mb-3 text-xs text-ink-muted">
            Sugestões aprovadas em{" "}
            <a href="/unidade-quantidade" className="text-series-1 hover:underline">
              Unidade/Quantidade
            </a>{" "}
            ficam aqui aguardando gravação real no SIMO.
          </p>
          <AplicarUnidadeBotao pendentes={sugestoesUnidadeAprovadas ?? 0} />
        </section>

        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">
            Cadastros pendentes de aprovação
            {pendentes && pendentes.length > 0 && (
              <span className="ml-2 rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-semibold text-status-warning">
                {pendentes.length}
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {(pendentes ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-black/5 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{p.nome}</p>
                  <p className="truncate text-xs text-ink-muted">{p.email}</p>
                </div>
                <AprovarBotoes userId={p.id} />
              </div>
            ))}
            {(!pendentes || pendentes.length === 0) && (
              <p className="text-sm text-ink-muted">Nenhum cadastro pendente.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Produtividade — gravação no SIMO</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="pb-2 font-medium">Pessoa</th>
                <th className="pb-2 font-medium">Gravações</th>
                <th className="pb-2 font-medium">Sucesso</th>
                <th className="pb-2 font-medium">Última</th>
              </tr>
            </thead>
            <tbody>
              {(unidadeProdutividade ?? []).map(
                (p: { executado_por: string; nome: string; total: number; sucessos: number; ultima_gravacao: string }) => (
                  <tr key={p.executado_por ?? "desconhecido"} className="border-t border-black/5">
                    <td className="py-1.5 text-ink-primary">{p.nome}</td>
                    <td className="py-1.5 text-ink-secondary">{p.total}</td>
                    <td className="py-1.5 text-ink-secondary">{p.sucessos}</td>
                    <td className="py-1.5 text-xs text-ink-muted">{new Date(p.ultima_gravacao).toLocaleString("pt-BR")}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          {(!unidadeProdutividade || unidadeProdutividade.length === 0) && (
            <p className="text-sm text-ink-muted">Nenhuma gravação registrada ainda.</p>
          )}
        </section>

        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Histórico recente de gravação</h2>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {(unidadeLogRecente ?? []).map((l) => {
              const sucesso = /^Sucesso/.test(l.resultado);
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
                      {l.id_acao} · {l.nome_acao} — {l.unidade_antiga || "vazio"} → {l.unidade_nova}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {nomeExecutor} · {new Date(l.executado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </li>
              );
            })}
            {(!unidadeLogRecente || unidadeLogRecente.length === 0) && (
              <li className="text-sm text-ink-muted">Nenhuma gravação registrada ainda.</li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

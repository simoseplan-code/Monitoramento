import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { ChecklistItem } from "./ChecklistItem";
import { DATA_INICIO_REVISAO } from "@/lib/novasAcoes";

const CHECKS = [
  { campo: "kml_anexado" as const, label: "KML anexado" },
  { campo: "sem_duplicacao" as const, label: "Sem duplicação" },
  { campo: "trecho_unico" as const, label: "Trecho único" },
  { campo: "documentos_obrigatorios" as const, label: "Documentos obrigatórios inseridos" },
];

export default async function NovasAcoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const limite = ontem.toISOString().slice(0, 10);

  const { data: obras } = await supabase
    .from("obras")
    .select("id_acao, nome_acao, orgao, data_criacao")
    .gte("data_criacao", DATA_INICIO_REVISAO)
    .lte("data_criacao", limite)
    .order("data_criacao", { ascending: false })
    .limit(500);

  const { data: revisoes } = await supabase
    .from("obras_revisao")
    .select("id_acao, kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios");

  const revisaoPorId = new Map((revisoes ?? []).map((r) => [r.id_acao, r]));

  const ehConfirmado = (v: string | undefined) => v === "confirmado";
  const pendentes = (obras ?? []).filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    return !r || !ehConfirmado(r.kml_anexado) || !ehConfirmado(r.sem_duplicacao) || !ehConfirmado(r.trecho_unico) || !ehConfirmado(r.documentos_obrigatorios);
  });
  const aguardandoAtualizacao = pendentes.filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    if (!r) return false;
    return [r.kml_anexado, r.sem_duplicacao, r.trecho_unico, r.documentos_obrigatorios].includes("aguardando_atualizacao");
  }).length;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes: pendentes.length }}
      titulo="Novas ações"
      subtitulo={`${pendentes.length} ação(ões) aguardando revisão completa${aguardandoAtualizacao > 0 ? ` · ${aguardandoAtualizacao} com pendência no órgão` : ""}`}
    >
      <div className="space-y-3">
        {pendentes.map((o) => {
          const r = revisaoPorId.get(o.id_acao);
          return (
            <div key={o.id_acao} className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-primary">{o.nome_acao}</p>
                  <p className="text-xs text-ink-muted">
                    {o.id_acao} · {o.orgao ?? "Sem órgão"} · criada em{" "}
                    {o.data_criacao ? new Date(o.data_criacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHECKS.map((c) => (
                  <ChecklistItem
                    key={c.campo}
                    idAcao={o.id_acao}
                    campo={c.campo}
                    label={c.label}
                    status={r?.[c.campo] ?? "pendente"}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {pendentes.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma ação pendente de revisão. 🎉</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

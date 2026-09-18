import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { ChecklistItem } from "./ChecklistItem";
import { ConcluirBotao } from "./ConcluirBotao";
import { FiltrosNovasAcoes } from "./FiltrosNovasAcoes";
import { DATA_INICIO_REVISAO, ehConveniada, contarNovasAcoesPendentes } from "@/lib/novasAcoes";

const CHECKS = [
  { campo: "kml_anexado" as const, label: "KML anexado" },
  { campo: "sem_duplicacao" as const, label: "Sem duplicação" },
  { campo: "trecho_unico" as const, label: "Trecho único" },
  { campo: "documentos_obrigatorios" as const, label: "Documentos obrigatórios inseridos" },
];

export default async function NovasAcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; concluidos?: string }>;
}) {
  const { busca, orgao, concluidos } = await searchParams;
  const mostrarConcluidos = concluidos === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
  ]);

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const limite = ontem.toISOString().slice(0, 10);

  let query = supabase
    .from("obras")
    .select("id_acao, nome_acao, orgao, data_criacao, acao_conveniada")
    .gte("data_criacao", DATA_INICIO_REVISAO)
    .lte("data_criacao", limite)
    .order("data_criacao", { ascending: false })
    .limit(500);

  if (busca) query = query.or(`nome_acao.ilike.%${busca}%,id_acao.ilike.%${busca}%,orgao.ilike.%${busca}%`);
  if (orgao) query = query.eq("orgao", orgao);

  const { data: obrasBrutas } = await query;
  const candidatas = (obrasBrutas ?? []).filter((o) => !ehConveniada(o.acao_conveniada));

  // Só busca revisão das ações que realmente estão na tela — evita
  // trazer a tabela obras_revisao inteira conforme ela for crescendo.
  const idsCandidatas = candidatas.map((o) => o.id_acao);
  const { data: revisoes } =
    idsCandidatas.length > 0
      ? await supabase
          .from("obras_revisao")
          .select("id_acao, kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios, concluido")
          .in("id_acao", idsCandidatas)
      : { data: [] };

  const revisaoPorId = new Map((revisoes ?? []).map((r) => [r.id_acao, r]));

  const orgaosDisponiveis = [...new Set(candidatas.map((o) => o.orgao).filter((o): o is string => !!o))].sort();

  const visiveis = candidatas.filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    return mostrarConcluidos || !r?.concluido;
  });

  const pendentesCount = candidatas.filter((o) => !revisaoPorId.get(o.id_acao)?.concluido).length;
  const aguardandoAtualizacao = candidatas.filter((o) => {
    const r = revisaoPorId.get(o.id_acao);
    if (!r || r.concluido) return false;
    return [r.kml_anexado, r.sem_duplicacao, r.trecho_unico, r.documentos_obrigatorios].includes("aguardando_atualizacao");
  }).length;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Novas ações"
      subtitulo={`${pendentesCount} ação(ões) aguardando conclusão${aguardandoAtualizacao > 0 ? ` · ${aguardandoAtualizacao} com pendência no órgão` : ""}`}
    >
      <FiltrosNovasAcoes
        buscaAtual={busca ?? ""}
        orgaoAtual={orgao ?? ""}
        orgaos={orgaosDisponiveis}
        mostrarConcluidos={mostrarConcluidos}
      />

      <div className="space-y-3">
        {visiveis.map((o) => {
          const r = revisaoPorId.get(o.id_acao);
          const tudoConfirmado =
            r?.kml_anexado === "confirmado" &&
            r?.sem_duplicacao === "confirmado" &&
            r?.trecho_unico === "confirmado" &&
            r?.documentos_obrigatorios === "confirmado";
          const concluido = !!r?.concluido;

          return (
            <div
              key={o.id_acao}
              className={`rounded-xl border p-4 shadow-card transition-colors ${
                concluido ? "border-status-good/20 bg-status-good-bg" : "border-black/5 bg-surface"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-primary">{o.nome_acao}</p>
                  <p className="text-xs text-ink-muted">
                    {o.id_acao} · {o.orgao ?? "Sem órgão"} · criada em{" "}
                    {o.data_criacao ? new Date(o.data_criacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </p>
                </div>
                {(tudoConfirmado || concluido) && <ConcluirBotao idAcao={o.id_acao} concluido={concluido} />}
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

        {visiveis.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma ação encontrada. 🎉</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosAcoes } from "./FiltrosAcoes";
import { Paginacao } from "@/components/Paginacao";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { sanitizarBusca } from "@/lib/seguranca";

const PAGE_SIZE = 100;

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
  searchParams: Promise<{ busca?: string; filtro?: string; orgao?: string; de?: string; ate?: string; pagina?: string }>;
}) {
  const { busca, filtro, orgao, de, ate, pagina } = await searchParams;
  const paginaAtual = Math.max(1, parseInt(pagina ?? "1", 10) || 1);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: pendentesAprovacao }, { count: totalGeral }, novasAcoesPendentes, { data: orgaosRpc }] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      contarNovasAcoesPendentes(supabase),
      supabase.rpc("acoes_orgaos"),
    ]);
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);

  // Filtro e classificação viram condição SQL, o Postgres já devolve só
  // a página pedida, em vez de trazer as 13 mil linhas pro Next.js
  // filtrar em memória a cada troca de página.
  let query = supabase
    .from("obras")
    .select("id_acao, nome_acao, numero_automatico, numero_siafe, orgao, status, estagio_atual", { count: "exact" });

  const termo = sanitizarBusca(busca);
  if (termo) {
    query = query.or(`nome_acao.ilike.%${termo}%,id_acao.ilike.%${termo}%,orgao.ilike.%${termo}%`);
  }

  if (orgao) {
    query = query.eq("orgao", orgao);
  }

  if (filtro === "vinculada") {
    query = query.not("numero_automatico", "is", null);
  } else if (filtro === "pendente") {
    query = query.is("numero_automatico", null).not("numero_siafe", "is", null);
  } else if (filtro === "sem_numero") {
    query = query.is("numero_automatico", null).is("numero_siafe", null);
  } else if (filtro === "dado_incorreto") {
    query = query.not("numero_siafe", "is", null).not("numero_siafe", "match", "^[0-9]{8}$");
  }

  if (de) query = query.gte("data_criacao", de);
  if (ate) query = query.lte("data_criacao", ate);

  const offset = (paginaAtual - 1) * PAGE_SIZE;
  const { data: obras, count: totalFiltrado } = await query.order("nome_acao").range(offset, offset + PAGE_SIZE - 1);

  const linhas = obras ?? [];
  const totalPaginas = Math.max(1, Math.ceil((totalFiltrado ?? 0) / PAGE_SIZE));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalGeral ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Ações"
      subtitulo={`${totalFiltrado ?? 0} ação(ões) encontradas · página ${paginaAtual} de ${totalPaginas}`}
    >
      <div className="rounded-xl border border-black/5 bg-surface shadow-card">
        <FiltrosAcoes
          buscaAtual={busca ?? ""}
          filtroAtual={filtro ?? ""}
          orgaoAtual={orgao ?? ""}
          orgaos={orgaosDisponiveis}
          deAtual={de ?? ""}
          ateAtual={ate ?? ""}
        />

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
                    <td className="tabular px-4 py-3 font-medium text-ink-primary"><IdAcaoLink id={r.id_acao} /></td>
                    <td className="px-4 py-3 text-ink-secondary">{r.nome_acao}</td>
                    <td className="px-4 py-3 text-ink-secondary">{r.orgao}</td>
                    <td className={`px-4 py-3 ${r.numero_siafe && !siafeValido(r.numero_siafe) ? "font-medium text-status-critical" : "text-ink-secondary"}`}>
                      {r.numero_siafe ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{r.estagio_atual ?? "-"}</td>
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

        <Paginacao paginaAtual={paginaAtual} totalPaginas={totalPaginas} baseHref="/acoes" params={{ busca, filtro, orgao, de, ate }} />
      </div>
    </AppShell>
  );
}

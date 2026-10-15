import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Paginacao } from "@/components/Paginacao";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { sanitizarBusca } from "@/lib/seguranca";
import { ListaNovasExecucao } from "./ListaNovasExecucao";
import { PendenciasPorOrgao, type ConfigPendencias, type GrupoOrgao } from "@/app/novas-acoes/PendenciasPorOrgao";
import { ITENS_EXECUCAO } from "@/lib/execucao";

const PAGE_SIZE = 30;

const CONFIG_PENDENCIAS_EXECUCAO: ConfigPendencias = {
  itens: ITENS_EXECUCAO.map((i) => ({ campo: i.campo, rotulo: i.label })),
  encaminharEndpoint: "/api/execucao/encaminhar",
  checkEndpoint: "/api/execucao/check",
  pdfHref: "/api/relatorios/pendencias?modulo=execucao",
  pdfNome: "pendencias-execucao",
  abaOrigem: "Em análise",
};

type LinhaEncaminhada = {
  id_acao: string;
  nome_acao: string;
  orgao: string;
  virou_em: string | null;
  itens: Record<string, "pendente" | "confirmado" | "aguardando_atualizacao">;
  obs: Record<string, string | null>;
  encaminhada_em: string;
  encaminhada_por_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
};

type Linha = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  data_criacao: string | null;
  virou_em: string;
  estagio_anterior: string | null;
  itens: Record<string, string>;
  obs: Record<string, string>;
  concluido: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  total_geral: number;
};

export default async function NovasEmExecucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; concluidos?: string; pagina?: string; aba?: string }>;
}) {
  const { busca, concluidos, pagina, aba } = await searchParams;
  const abaPendencias = aba === "pendencias";
  const mostrarConcluidos = concluidos === "1";
  const paginaAtual = Math.max(1, parseInt(pagina ?? "1", 10) || 1);
  const termo = sanitizarBusca(busca);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: linhasRpc, error: erroLista }, { data: pendentesRpc }, { data: equipeAtiva }, { data: encaminhadasRpc }] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      contarNovasAcoesPendentes(supabase),
      supabase.rpc("novas_execucao_lista", { mostrar_concluidos: mostrarConcluidos, busca: termo || null, pagina: paginaAtual, tamanho: PAGE_SIZE }),
      supabase.rpc("contar_novas_execucao_pendentes"),
      // Só admin enxerga os perfis de todo mundo (RLS); pros demais volta vazio e a troca nem aparece.
      supabase.from("profiles").select("id, nome").eq("status", "aprovado").order("nome"),
      supabase.rpc("novas_execucao_encaminhadas"),
    ]);

  const linhas = (linhasRpc ?? []) as Linha[];
  const totalFiltrado = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const pendentes = Number(pendentesRpc ?? 0);
  const ehAdmin = !!profile?.is_admin;
  const equipe = ehAdmin ? ((equipeAtiva ?? []) as { id: string; nome: string }[]) : [];
  const usuario = { id: user!.id, nome: profile?.nome ?? "Você" };

  const encaminhadas = (encaminhadasRpc ?? []) as LinhaEncaminhada[];
  const grupos: GrupoOrgao[] = [];
  for (const e of encaminhadas) {
    let g = grupos.find((x) => x.orgao === e.orgao);
    if (!g) {
      g = { orgao: e.orgao, acoes: [] };
      grupos.push(g);
    }
    g.acoes.push({
      idAcao: e.id_acao,
      nomeAcao: e.nome_acao,
      info: e.virou_em ? `virou em execução em ${new Date(e.virou_em + "T00:00:00").toLocaleDateString("pt-BR")}` : null,
      itens: e.itens ?? {},
      obs: e.obs ?? {},
      encaminhadaEm: e.encaminhada_em,
      encaminhadaPor: e.encaminhada_por_nome,
      responsavelId: e.responsavel_id,
      responsavelNome: e.responsavel_nome,
    });
  }

  const estiloAba = (ativa: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${ativa ? "bg-series-1 text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"}`;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={ehAdmin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Novas em Execução"
      subtitulo={abaPendencias ? `${encaminhadas.length} ação(ões) aguardando solução de pendência em ${grupos.length} órgão(s)` : `${totalFiltrado} ação(ões) ${mostrarConcluidos ? "concluída(s)" : "aguardando análise"}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/novas-em-execucao" className={estiloAba(!abaPendencias && !mostrarConcluidos)}>
            Em análise <span className="tabular opacity-80">({pendentes})</span>
          </Link>
          <Link
            href="/novas-em-execucao?aba=pendencias"
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              abaPendencias ? "bg-status-warning text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"
            }`}
          >
            Aguardando solução de pendência <span className="tabular opacity-80">({encaminhadas.length})</span>
          </Link>
          <Link href="/novas-em-execucao?concluidos=1" className={estiloAba(!abaPendencias && mostrarConcluidos)}>
            Concluídas
          </Link>
          {!abaPendencias && (
            <form action="/novas-em-execucao" className="ml-auto flex items-center gap-2">
              {mostrarConcluidos && <input type="hidden" name="concluidos" value="1" />}
              <input
                name="busca"
                defaultValue={busca ?? ""}
                placeholder="Buscar ação, órgão..."
                className="w-56 rounded-lg border border-black/10 bg-plane px-3 py-1.5 text-xs text-ink-secondary focus:border-series-1 focus:outline-none"
              />
            </form>
          )}
        </div>

        {abaPendencias ? (
          <PendenciasPorOrgao grupos={grupos} usuarioId={usuario.id} ehAdmin={ehAdmin} config={CONFIG_PENDENCIAS_EXECUCAO} />
        ) : (
        <>
        {erroLista && (
          <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar a lista: {erroLista.message}</p>
        )}

        <div className="space-y-3">
          <ListaNovasExecucao
            usuario={usuario}
            ehAdmin={ehAdmin}
            equipe={equipe}
            itens={linhas.map((l) => ({
              idAcao: l.id_acao,
              nomeAcao: l.nome_acao,
              orgao: l.orgao,
              virouEm: l.virou_em,
              estagioAnterior: l.estagio_anterior,
              itens: l.itens ?? {},
              obs: l.obs ?? {},
              concluido: l.concluido,
              responsavel: l.responsavel_id ? { id: l.responsavel_id, nome: l.responsavel_nome ?? "-" } : null,
            }))}
          />

          {linhas.length === 0 && !erroLista && (
            <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
              <p className="text-sm text-ink-muted">
                {mostrarConcluidos
                  ? "Nenhuma análise concluída ainda."
                  : "Nenhuma ação virou EM EXECUÇÃO desde que o histórico começou. A lista enche a cada sincronização com o SIMO, com o que mudou de estágio."}
              </p>
            </div>
          )}

          <Paginacao
            paginaAtual={paginaAtual}
            totalPaginas={totalPaginas}
            baseHref="/novas-em-execucao"
            params={{ busca: termo || undefined, concluidos: mostrarConcluidos ? "1" : undefined }}
          />
        </div>
        </>
        )}
      </div>
    </AppShell>
  );
}

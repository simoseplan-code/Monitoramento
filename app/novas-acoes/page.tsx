import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { ListaNovasAcoes } from "./ListaNovasAcoes";
import { PendenciasPorOrgao, type AcaoEncaminhada, type GrupoOrgao } from "./PendenciasPorOrgao";
import { CardAcaoExcluida } from "./CardAcaoExcluida";
import { FiltrosNovasAcoes } from "./FiltrosNovasAcoes";
import { Paginacao } from "@/components/Paginacao";
import { DATA_INICIO_REVISAO, contarNovasAcoesPendentes } from "@/lib/novasAcoes";

const PAGE_SIZE = 50;

type LinhaExcluida = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  data_criacao: string | null;
  kml_anexado: "pendente" | "confirmado" | "aguardando_atualizacao";
  sem_duplicacao: "pendente" | "confirmado" | "aguardando_atualizacao";
  documentos_obrigatorios: "pendente" | "confirmado" | "aguardando_atualizacao";
  excluida_em: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
};

type LinhaNovaAcao = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  data_criacao: string;
  kml_anexado: "pendente" | "confirmado" | "aguardando_atualizacao";
  sem_duplicacao: "pendente" | "confirmado" | "aguardando_atualizacao";
  documentos_obrigatorios: "pendente" | "confirmado" | "aguardando_atualizacao";
  concluido: boolean;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  total_geral: number;
};

export default async function NovasAcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; concluidos?: string; pagina?: string; aba?: string }>;
}) {
  const { busca, orgao, concluidos, pagina, aba } = await searchParams;
  const abaPendencias = aba === "pendencias";
  const mostrarConcluidos = concluidos === "1";
  const paginaAtual = Math.max(1, parseInt(pagina ?? "1", 10) || 1);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: aguardandoAtualizacao },
    { data: equipeAtiva },
    { data: excluidasRpc },
    { data: encaminhadasRpc },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("novas_acoes_lista", {
      data_inicio: DATA_INICIO_REVISAO,
      busca: busca || null,
      orgao_filtro: orgao || null,
      mostrar_concluidos: mostrarConcluidos,
      pagina: paginaAtual,
      tamanho: PAGE_SIZE,
    }),
    supabase.rpc("novas_acoes_orgaos", { data_inicio: DATA_INICIO_REVISAO }),
    supabase.rpc("contar_aguardando_atualizacao", { data_inicio: DATA_INICIO_REVISAO }),
    // Só admin enxerga os perfis de todo mundo (RLS); pros demais volta vazio e a troca nem aparece.
    supabase.from("profiles").select("id, nome").eq("status", "aprovado").order("nome"),
    // Ações que sumiram do SIMO com análise pendente (nada some em silêncio).
    supabase.rpc("novas_acoes_excluidas"),
    // Ações encaminhadas ao órgão (aba "Aguardando solução de pendência").
    supabase.rpc("novas_acoes_encaminhadas"),
  ]);
  type LinhaEncaminhada = {
    id_acao: string;
    nome_acao: string;
    orgao: string;
    data_criacao: string | null;
    kml_anexado: AcaoEncaminhada["kml"];
    sem_duplicacao: AcaoEncaminhada["duplicacao"];
    documentos_obrigatorios: AcaoEncaminhada["documentos"];
    encaminhada_em: string;
    encaminhada_por_nome: string | null;
    responsavel_id: string | null;
    responsavel_nome: string | null;
  };
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
      dataCriacao: e.data_criacao,
      kml: e.kml_anexado,
      duplicacao: e.sem_duplicacao,
      documentos: e.documentos_obrigatorios,
      encaminhadaEm: e.encaminhada_em,
      encaminhadaPor: e.encaminhada_por_nome,
      responsavelId: e.responsavel_id,
      responsavelNome: e.responsavel_nome,
    });
  }
  const excluidas = (excluidasRpc ?? []) as LinhaExcluida[];
  const ehAdmin = !!profile?.is_admin;
  const equipe = ehAdmin ? ((equipeAtiva ?? []) as { id: string; nome: string }[]) : [];
  const usuario = { id: user!.id, nome: profile?.nome ?? "Você" };

  const linhas = (linhasRpc ?? []) as LinhaNovaAcao[];
  const totalGeral = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalGeral / PAGE_SIZE));
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Novas ações"
      subtitulo={abaPendencias ? `${encaminhadas.length} ação(ões) aguardando solução de pendência em ${grupos.length} órgão(s)` : `${totalGeral} ação(ões)${mostrarConcluidos ? "" : " aguardando conclusão"}${
        (aguardandoAtualizacao ?? 0) > 0 ? ` · ${aguardandoAtualizacao} com pendência no órgão` : ""
      }${excluidas.length > 0 ? ` · ${excluidas.length} excluída(s) do SIMO com pendência` : ""}`}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/novas-acoes"
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            !abaPendencias ? "bg-series-1 text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"
          }`}
        >
          Em análise
        </Link>
        <Link
          href="/novas-acoes?aba=pendencias"
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            abaPendencias ? "bg-status-warning text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"
          }`}
        >
          Aguardando solução de pendência <span className="tabular opacity-80">({encaminhadas.length})</span>
        </Link>
      </div>

      {abaPendencias ? (
        <PendenciasPorOrgao grupos={grupos} usuarioId={usuario.id} ehAdmin={ehAdmin} />
      ) : (
      <>
      <div className="mb-4">
        <FiltrosNovasAcoes
          buscaAtual={busca ?? ""}
          orgaoAtual={orgao ?? ""}
          orgaos={orgaosDisponiveis}
          mostrarConcluidos={mostrarConcluidos}
        />
      </div>

      {excluidas.length > 0 && (
        <section className="mb-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-status-critical">Ações excluídas do SIMO com análise pendente ({excluidas.length})</h2>
            <p className="text-xs text-ink-muted">
              Estas ações não existem mais no SIMO, mas ficaram com a análise incompleta. Quando não houver mais nada a fazer, dê baixa.
            </p>
          </div>
          {excluidas.map((e) => (
            <CardAcaoExcluida
              key={e.id_acao}
              idAcao={e.id_acao}
              nomeAcao={e.nome_acao}
              orgao={e.orgao}
              dataCriacao={e.data_criacao}
              excluidaEm={e.excluida_em}
              status={{ kml_anexado: e.kml_anexado, sem_duplicacao: e.sem_duplicacao, documentos_obrigatorios: e.documentos_obrigatorios }}
              responsavel={e.responsavel_id ? { id: e.responsavel_id, nome: e.responsavel_nome ?? "—" } : null}
              podeDarBaixa={ehAdmin || !e.responsavel_id || e.responsavel_id === usuario.id}
            />
          ))}
        </section>
      )}

      <div className="space-y-3">
        <ListaNovasAcoes
          usuario={usuario}
          ehAdmin={ehAdmin}
          equipe={equipe}
          itens={linhas.map((o) => ({
            idAcao: o.id_acao,
            nomeAcao: o.nome_acao,
            orgao: o.orgao,
            dataCriacao: o.data_criacao,
            concluido: o.concluido,
            responsavel: o.responsavel_id ? { id: o.responsavel_id, nome: o.responsavel_nome ?? "—" } : null,
            status: {
              kml_anexado: o.kml_anexado,
              sem_duplicacao: o.sem_duplicacao,
              documentos_obrigatorios: o.documentos_obrigatorios,
            },
          }))}
        />

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma ação encontrada. 🎉</p>
          </div>
        )}

        <Paginacao
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          baseHref="/novas-acoes"
          params={{ busca, orgao, concluidos: mostrarConcluidos ? "1" : undefined }}
        />
      </div>
      </>
      )}
    </AppShell>
  );
}

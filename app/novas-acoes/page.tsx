import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CardNovaAcao } from "./CardNovaAcao";
import { FiltrosNovasAcoes } from "./FiltrosNovasAcoes";
import { Paginacao } from "@/components/Paginacao";
import { DATA_INICIO_REVISAO, contarNovasAcoesPendentes } from "@/lib/novasAcoes";

const PAGE_SIZE = 50;

type LinhaNovaAcao = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  data_criacao: string;
  kml_anexado: "pendente" | "confirmado" | "aguardando_atualizacao";
  sem_duplicacao: "pendente" | "confirmado" | "aguardando_atualizacao";
  trecho_unico: "pendente" | "confirmado" | "aguardando_atualizacao";
  documentos_obrigatorios: "pendente" | "confirmado" | "aguardando_atualizacao";
  concluido: boolean;
  total_geral: number;
};

export default async function NovasAcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; concluidos?: string; pagina?: string }>;
}) {
  const { busca, orgao, concluidos, pagina } = await searchParams;
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
  ]);

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
      subtitulo={`${totalGeral} ação(ões)${mostrarConcluidos ? "" : " aguardando conclusão"}${
        (aguardandoAtualizacao ?? 0) > 0 ? ` · ${aguardandoAtualizacao} com pendência no órgão` : ""
      }`}
    >
      <div className="mb-4">
        <FiltrosNovasAcoes
          buscaAtual={busca ?? ""}
          orgaoAtual={orgao ?? ""}
          orgaos={orgaosDisponiveis}
          mostrarConcluidos={mostrarConcluidos}
        />
      </div>

      <div className="space-y-3">
        {linhas.map((o) => (
          <CardNovaAcao
            key={o.id_acao}
            idAcao={o.id_acao}
            nomeAcao={o.nome_acao}
            orgao={o.orgao}
            dataCriacao={o.data_criacao}
            concluido={o.concluido}
            statusInicial={{
              kml_anexado: o.kml_anexado,
              sem_duplicacao: o.sem_duplicacao,
              trecho_unico: o.trecho_unico,
              documentos_obrigatorios: o.documentos_obrigatorios,
            }}
          />
        ))}

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
    </AppShell>
  );
}

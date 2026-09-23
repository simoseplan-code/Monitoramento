import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { UploadCsvSobreposicoes } from "./UploadCsvSobreposicoes";
import { CardSobreposicao } from "./CardSobreposicao";
import { FiltrosSobreposicoes } from "./FiltrosSobreposicoes";
import { PaginacaoSobreposicoes } from "./PaginacaoSobreposicoes";
import type { ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";

const PAGE_SIZE = 30;

type LinhaSobreposicao = {
  chave_local: string;
  obras: ObraNoLocal[];
  qtd_obras: number;
  extensao_m: number | null;
  tolerancia_m: number | null;
  qtd_segmentos: number | null;
  lat_inicio: number | null;
  lon_inicio: number | null;
  lat_fim: number | null;
  lon_fim: number | null;
  status: "pendente" | "ok" | "problema";
  observacao: string | null;
  importado_em: string;
  total_geral: number;
};

export default async function SobreposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ revisadas?: string; orgao?: string; ano?: string; pagina?: string }>;
}) {
  const { revisadas, orgao, ano, pagina } = await searchParams;
  const mostrarRevisadas = revisadas === "1";
  const anoFiltro = ano ? parseInt(ano, 10) : null;
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
    { count: totalPendentes },
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: anosRpc },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.from("sobreposicoes").select("chave_local", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.rpc("sobreposicoes_lista", {
      mostrar_revisadas: mostrarRevisadas,
      orgao_filtro: orgao || null,
      ano_filtro: anoFiltro,
      pagina: paginaAtual,
      tamanho: PAGE_SIZE,
    }),
    supabase.rpc("sobreposicoes_orgaos"),
    supabase.rpc("sobreposicoes_anos"),
  ]);

  const linhas = (linhasRpc ?? []) as LinhaSobreposicao[];
  const totalFiltrado = linhas[0]?.total_geral ?? 0;
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);
  const anosDisponiveis = (anosRpc ?? []).map((r: { ano: number }) => r.ano);

  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{
        acoes: totalAcoes ?? 0,
        pendentesAprovacao: pendentesAprovacao ?? 0,
        novasAcoesPendentes,
        sobreposicoesPendentes: totalPendentes ?? 0,
      }}
      titulo="Sobreposições"
      subtitulo={`${totalFiltrado} local(is)${mostrarRevisadas ? " já revisado(s)" : " aguardando revisão"}`}
    >
      <div className="mb-4">
        <UploadCsvSobreposicoes />
      </div>

      <div className="mb-4">
        <FiltrosSobreposicoes
          mostrarRevisadas={mostrarRevisadas}
          orgaoAtual={orgao ?? ""}
          orgaos={orgaosDisponiveis}
          anoAtual={ano ?? ""}
          anos={anosDisponiveis}
        />
      </div>

      <div className="space-y-3">
        {linhas.map((l) => (
          <CardSobreposicao
            key={l.chave_local}
            chaveLocal={l.chave_local}
            obras={l.obras}
            extensaoM={l.extensao_m}
            toleranciaM={l.tolerancia_m}
            qtdSegmentos={l.qtd_segmentos}
            latInicio={l.lat_inicio}
            lonInicio={l.lon_inicio}
            latFim={l.lat_fim}
            lonFim={l.lon_fim}
            statusInicial={l.status}
            observacaoInicial={l.observacao}
          />
        ))}

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">
              {mostrarRevisadas ? "Nenhum local revisado ainda." : "Nenhuma sobreposição pendente. 🎉"}
            </p>
          </div>
        )}

        <PaginacaoSobreposicoes
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          revisadas={mostrarRevisadas}
          orgao={orgao ?? ""}
          ano={ano ?? ""}
        />
      </div>
    </AppShell>
  );
}

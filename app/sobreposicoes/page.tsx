import { FileSpreadsheet, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { UploadCsvSobreposicoes } from "./UploadCsvSobreposicoes";
import { AtualizarDoMapa } from "./AtualizarDoMapa";
import { CardSobreposicao } from "./CardSobreposicao";
import { BarraSobreposicoes, FiltrosLaterais } from "./FiltrosSobreposicoes";
import { Paginacao } from "@/components/Paginacao";
import type { ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";
import { lerFiltros, paramsDe, type ParamsBrutos } from "@/lib/sobreposicoes/filtros";

const PAGE_SIZE = 30;

// Um registro = um PAR de obras (todos os trechos onde elas se sobrepõem, juntos).
type LinhaPar = {
  chave_local: string;
  chaves_locais: string[];
  obras: ObraNoLocal[];
  qtd_obras: number;
  extensao_total: number | null;
  qtd_trechos: number;
  tolerancia_m: number | null;
  lat_inicio: number | null;
  lon_inicio: number | null;
  status: "pendente" | "ok" | "problema" | "solucionado";
  observacao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  solucionado_por_nome: string | null;
  solucionado_em: string | null;
  solucao: string | null;
  total_geral: number;
};

export default async function SobreposicoesPage({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const brutos = await searchParams;
  const f = lerFiltros(brutos);
  const paginaAtual = Math.max(1, parseInt(brutos.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Argumentos comuns da lista e das contagens (listas vazias = sem filtro).
  const comuns = (grupo: string) => ({
    orgaos_filtro: f.orgaos.length ? f.orgaos : null,
    anos_filtro: f.anos.length ? f.anos.map(Number) : null,
    tipologias_filtro: f.tipologias.length ? f.tipologias.map((t) => t.trim().toUpperCase()) : null,
    tipologia_todas_filtro: f.tipologiaTodas || null,
    ocultar_estrada_vicinal: f.ocultarEstradaVicinal,
    grupo_situacao: grupo,
    status_obras_filtro: f.statusObras.length ? f.statusObras : null,
    pct_min: f.pctMin ? Number(f.pctMin) : null,
    pct_max: f.pctMax ? Number(f.pctMax) : null,
    busca: f.busca || null,
  });
  const outroGrupo = f.grupo === "concluidas" ? "andamento" : "concluidas";

  const [
    { data: profile },
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    { data: totalPendentes },
    { data: contagensRpc, error: erroContagens },
    { data: contagensOutroGrupo },
    { data: linhasRpc, error: erroLista },
    { data: orgaosRpc },
    { data: anosRpc },
    { data: tipologiasRpc },
    { data: statusObrasRpc },
    { data: equipeAtiva },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("contar_sobreposicoes_pendentes"),
    // Números das abas de status: seguem os filtros da lateral.
    supabase.rpc("sobreposicoes_pares_contagens", comuns(f.grupo)),
    // Só para mostrar quantos aguardam revisão no outro grupo.
    supabase.rpc("sobreposicoes_pares_contagens", comuns(outroGrupo)),
    supabase.rpc("sobreposicoes_pares_lista", { ...comuns(f.grupo), filtro_status: f.status, pagina: paginaAtual, tamanho: PAGE_SIZE }),
    supabase.rpc("sobreposicoes_orgaos"),
    supabase.rpc("sobreposicoes_anos"),
    supabase.rpc("sobreposicoes_tipologias"),
    supabase.rpc("sobreposicoes_status_obras"),
    // Só admin enxerga os perfis de todo mundo (RLS); pros demais volta vazio.
    supabase.from("profiles").select("id, nome").eq("status", "aprovado").order("nome"),
  ]);
  const ehAdmin = !!profile?.is_admin;
  const equipe = ehAdmin ? ((equipeAtiva ?? []) as { id: string; nome: string }[]) : [];
  const usuario = { id: user!.id, nome: profile?.nome ?? "Você" };

  const linhasCsv = (linhasRpc ?? []) as LinhaPar[];

  // O CSV do Mapa de Obras é uma foto do dia da exportação e só traz o
  // "Número do Contrato no SIAFE" digitado, o contrato de fato vinculado
  // fica em numero_automatico (é ele que a tela mostra). Contrato e status
  // vêm da base sincronizada (atual); o valor do CSV só vale se a ação não
  // for encontrada na base.
  const idsNaPagina = Array.from(new Set(linhasCsv.flatMap((l) => l.obras.map((o) => o.id).filter((id): id is string => !!id))));
  const { data: obrasVivas } =
    idsNaPagina.length > 0
      ? await supabase.from("obras").select("id_acao, numero_automatico, numero_siafe, status, estagio_atual, percentual_execucao, data_receb_definitivo, data_receb_provisorio").in("id_acao", idsNaPagina)
      : { data: [] as { id_acao: string; numero_automatico: string | null; numero_siafe: string | null; status: string | null; estagio_atual: string | null; percentual_execucao: number | null; data_receb_definitivo: string | null; data_receb_provisorio: string | null }[] };
  const vivaPorId = new Map((obrasVivas ?? []).map((o) => [o.id_acao, o]));
  const linhas = linhasCsv.map((l) => ({
    ...l,
    obras: l.obras.map((o) => {
      const viva = o.id ? vivaPorId.get(o.id) : undefined;
      if (!viva) return o;
      return {
        ...o,
        contrato: viva.numero_automatico || null,
        siafe_nao_vinculado: viva.numero_automatico ? null : viva.numero_siafe,
        status: viva.status || o.status,
        percentual: viva.percentual_execucao,
        estagio: viva.estagio_atual,
        concluido_em: viva.data_receb_definitivo || viva.data_receb_provisorio,
      };
    }),
  }));
  const totalFiltrado = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const contagens = {
    pendente: Number(contagensRpc?.[0]?.pendente ?? 0),
    ok: Number(contagensRpc?.[0]?.ok ?? 0),
    problema: Number(contagensRpc?.[0]?.problema ?? 0),
    solucionado: Number(contagensRpc?.[0]?.solucionado ?? 0),
  };

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{
        acoes: totalAcoes ?? 0,
        pendentesAprovacao: pendentesAprovacao ?? 0,
        novasAcoesPendentes,
        sobreposicoesPendentes: Number(totalPendentes ?? 0),
      }}
      titulo="Sobreposições"
      subtitulo={`${f.grupo === "concluidas" ? "Concluída × Concluída" : "Em andamento"}: ${totalFiltrado} par(es) de obras, ${{ pendente: "aguardando revisão", ok: "sem problema", problema: "com problema", solucionado: "solucionado" }[f.status]}`}
    >
      <div className="mb-4 space-y-3">
        <AtualizarDoMapa />
        <UploadCsvSobreposicoes />
      </div>

      {(erroLista || erroContagens) && (
        <p className="mb-4 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          Falha ao carregar a lista: {(erroLista ?? erroContagens)?.message}. Se a mensagem falar de função que não existe, falta rodar o SQL 0103 no Supabase.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warning/20 bg-status-warning-bg px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-primary">Relatório de todos os pares com problema</p>
          <p className="text-xs text-ink-muted">
            {contagensRpc ? `${contagensRpc[0]?.problema ?? 0} par(es) com problema aguardando solução` : "Pares com problema aguardando solução"}, com IDs, órgãos, status, execução, trechos e a observação de quem analisou.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/relatorios?tipo=sobreposicoes_problemas" className="inline-flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90">
            <FileSpreadsheet size={14} /> Baixar Excel
          </a>
          <a href="/api/relatorios/sobreposicoes-problemas" className="inline-flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90">
            <FileText size={14} /> Baixar PDF
          </a>
        </div>
      </div>

      <div className="mb-4">
        <BarraSobreposicoes filtros={f} contagens={contagens} pendentesPorGrupo={{ [f.grupo]: contagens.pendente, [outroGrupo]: Number(contagensOutroGrupo?.[0]?.pendente ?? 0) }} />
      </div>

      <div className="flex items-start gap-4">
        <FiltrosLaterais
          filtros={f}
          orgaos={(orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao)}
          statusObras={(statusObrasRpc ?? []).map((r: { status: string; qtd: number | string }) => ({ valor: r.status, qtd: Number(r.qtd) }))}
          tipologias={(tipologiasRpc ?? []).map((r: { tipologia: string }) => r.tipologia)}
          anos={(anosRpc ?? []).map((r: { ano: number }) => r.ano)}
        />

        <div className="min-w-0 flex-1 space-y-3">
          {linhas.map((l) => (
            <CardSobreposicao
              key={l.chave_local}
              chaveLocal={l.chave_local}
              obras={l.obras}
              extensaoM={l.extensao_total}
              toleranciaM={l.tolerancia_m}
              qtdTrechos={l.qtd_trechos}
              latInicio={l.lat_inicio}
              lonInicio={l.lon_inicio}
              latFim={null}
              lonFim={null}
              statusInicial={l.status}
              observacaoInicial={l.observacao}
              solucionadoPor={l.solucionado_por_nome ? { nome: l.solucionado_por_nome, em: l.solucionado_em } : null}
              solucao={l.solucao}
              responsavelInicial={l.responsavel_id ? { id: l.responsavel_id, nome: l.responsavel_nome ?? "-" } : null}
              usuario={usuario}
              ehAdmin={ehAdmin}
              equipe={equipe}
            />
          ))}

          {linhas.length === 0 && (
            <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
              <p className="text-sm text-ink-muted">{f.status === "pendente" ? "Nenhuma sobreposição pendente com esses filtros." : "Nenhum par nesta lista com esses filtros."}</p>
            </div>
          )}

          <Paginacao paginaAtual={paginaAtual} totalPaginas={totalPaginas} baseHref="/sobreposicoes" params={paramsDe(f)} />
        </div>
      </div>
    </AppShell>
  );
}

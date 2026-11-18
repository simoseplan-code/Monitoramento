import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { UploadCsvSobreposicoes } from "./UploadCsvSobreposicoes";
import { AtualizarDoMapa } from "./AtualizarDoMapa";
import { CardSobreposicao } from "./CardSobreposicao";
import { BarraSobreposicoes, FiltrosLaterais } from "./FiltrosSobreposicoes";
import { PainelPendencias, type LinhaPainel } from "./PainelPendencias";
import { Paginacao } from "@/components/Paginacao";
import type { ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoDaAba, lerFiltros, lerGravado, paramsDe, TELA_FILTRO, type ParamsBrutos } from "@/lib/sobreposicoes/filtros";

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
  destino: "pendencias" | "cgfr";
  total_geral: number;
};

export default async function SobreposicoesPage({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const brutos = await searchParams;
  const paginaAtual = Math.max(1, parseInt(brutos.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Filtro gravado: UM SÓ, vale para todos (quem gravou por último). Só vira o padrão quando a tela abre "limpa" (pelo menu);
  // qualquer clique na própria tela já leva os filtros na URL e eles mandam.
  const adminFiltro = createAdminClient();
  const { data: gravadoRow } = await adminFiltro.from("filtros_salvos").select("usuario_id, estado, atualizado_em").eq("tela", TELA_FILTRO).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  const gravadoEstado = lerGravado(gravadoRow?.estado);
  let gravadoPor: string | null = null;
  if (gravadoRow?.usuario_id) {
    const { data: quem } = await adminFiltro.from("profiles").select("nome").eq("id", gravadoRow.usuario_id).maybeSingle();
    gravadoPor = (quem?.nome as string | null) ?? null;
  }
  const filtrosDaUrl = lerFiltros(brutos);
  const f = Object.keys(brutos).length === 0 && gravadoEstado ? { ...filtrosDaUrl, ...gravadoEstado } : filtrosDaUrl;

  // Argumentos comuns da lista e das contagens (listas vazias = sem filtro).
  const comuns = (grupo: string) => ({
    orgaos_filtro: f.orgaos.length ? f.orgaos : null,
    anos_filtro: f.anos.length ? f.anos.map(Number) : null,
    tipologias_filtro: f.tipologias.length ? f.tipologias.map((t) => t.trim().toUpperCase()) : null,
    tipologia_todas_filtro: f.tipologiaTodas || null,
    ocultar_estrada_vicinal: f.ocultarEstradaVicinal,
    sem_vicinais: f.semVicinais,
    grupo_situacao: grupo,
    status_obras_filtro: f.statusObras.length ? f.statusObras : null,
    pct_min: f.pctMin ? Number(f.pctMin) : null,
    pct_max: f.pctMax ? Number(f.pctMax) : null,
    busca: f.busca || null,
  });
  // Pendências e CGFR são duas listas iguais de pares com problema, separadas pelo destino escolhido na análise.
  const nasPendencias = f.aba !== "analise";
  const destino = destinoDaAba(f.aba);
  const outroGrupo = f.grupo === "concluidas" ? "andamento" : "concluidas";
  // A função de resumo devolve os dois grupos juntos, então não recebe o filtro de grupo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { grupo_situacao: _g, ...semGrupo } = comuns(f.grupo);

  const [
    { data: profile },
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    { data: totalPendentes },
    { data: resumoRpc, error: erroContagens },
    { data: painelRpc },
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
    // Números das abas de status e dos dois grupos, de uma vez: seguem os filtros da lateral.
    supabase.rpc("sobreposicoes_pares_resumo", semGrupo),
    // Só na aba Pendências: resumo por órgão (um registro de total e um por órgão).
    nasPendencias ? supabase.rpc("sobreposicoes_pendencias_painel", { ...semGrupo, filtro_status: f.status, destino_filtro: destino }) : Promise.resolve({ data: null }),
    supabase.rpc("sobreposicoes_pares_lista", { ...comuns(nasPendencias ? "" : f.grupo), filtro_status: f.status, destino_filtro: nasPendencias ? destino : "pendencias", pagina: paginaAtual, tamanho: PAGE_SIZE }),
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
  type Resumo = { concluidas: boolean; destino: string; pendente: number | string; ok: number | string; problema: number | string; solucionado: number | string };
  const resumo = (concluidas: boolean, d: "pendencias" | "cgfr" = "pendencias") => ((resumoRpc ?? []) as Resumo[]).find((r) => r.concluidas === concluidas && r.destino === d);
  const doGrupo = resumo(f.grupo === "concluidas");
  const doOutro = resumo(f.grupo !== "concluidas");
  const contagens = {
    pendente: Number(doGrupo?.pendente ?? 0),
    ok: Number(doGrupo?.ok ?? 0),
    problema: Number(doGrupo?.problema ?? 0),
    solucionado: Number(doGrupo?.solucionado ?? 0),
  };

  // Pendências somam os dois grupos (em andamento e concluída).
  const somaDestino = (d: "pendencias" | "cgfr") => ({
    aguardando: Number(resumo(false, d)?.problema ?? 0) + Number(resumo(true, d)?.problema ?? 0),
    solucionados: Number(resumo(false, d)?.solucionado ?? 0) + Number(resumo(true, d)?.solucionado ?? 0),
  });
  const pendencias = somaDestino("pendencias");
  const cgfr = somaDestino("cgfr");

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
      subtitulo={`${nasPendencias ? (f.aba === "cgfr" ? "CGFR" : "Pendências") : f.grupo === "concluidas" ? "Concluída × Concluída" : "Em andamento"}: ${totalFiltrado} par(es) de obras, ${{ pendente: "aguardando revisão", ok: "sem problema", problema: "com problema", solucionado: "solucionado" }[f.status]}`}
    >
      <div className="mb-4 space-y-3">
        <AtualizarDoMapa />
        <UploadCsvSobreposicoes />
      </div>

      {(erroLista || erroContagens) && (
        <p className="mb-4 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          Falha ao carregar a lista: {(erroLista ?? erroContagens)?.message}. Se a mensagem falar de função que não existe, falta rodar o SQL mais recente da pasta supabase/migrations (0107).
        </p>
      )}

      <div className="mb-4">
        <BarraSobreposicoes filtros={f} contagens={contagens} pendentesPorGrupo={{ [f.grupo]: contagens.pendente, [outroGrupo]: Number(doOutro?.pendente ?? 0) }} pendencias={pendencias} cgfr={cgfr} />
      </div>

      {nasPendencias && <PainelPendencias filtros={f} linhas={(painelRpc ?? []) as LinhaPainel[]} />}

      <div className="flex items-start gap-4">
        <FiltrosLaterais
          filtros={f}
          orgaos={(orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao)}
          statusObras={(statusObrasRpc ?? []).map((r: { status: string; qtd: number | string }) => ({ valor: r.status, qtd: Number(r.qtd) }))}
          tipologias={(tipologiasRpc ?? []).map((r: { tipologia: string }) => r.tipologia)}
          anos={(anosRpc ?? []).map((r: { ano: number }) => r.ano)}
          gravado={gravadoEstado && gravadoRow ? { estado: gravadoEstado, atualizadoEm: gravadoRow.atualizado_em as string, por: gravadoPor } : null}
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
              destino={l.destino}
              responsavelInicial={l.responsavel_id ? { id: l.responsavel_id, nome: l.responsavel_nome ?? "-" } : null}
              usuario={usuario}
              ehAdmin={ehAdmin}
              equipe={equipe}
            />
          ))}

          {linhas.length === 0 && (
            <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
              <p className="text-sm text-ink-muted">{nasPendencias ? (f.aba === "cgfr" ? "Nada no CGFR nesta lista com esses filtros." : "Nenhuma pendência nesta lista com esses filtros.") : f.status === "pendente" ? "Nenhuma sobreposição pendente com esses filtros." : "Nenhum par nesta lista com esses filtros."}</p>
            </div>
          )}

          <Paginacao paginaAtual={paginaAtual} totalPaginas={totalPaginas} baseHref="/sobreposicoes" params={paramsDe(f)} />
        </div>
      </div>
    </AppShell>
  );
}

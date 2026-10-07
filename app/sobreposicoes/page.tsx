import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { UploadCsvSobreposicoes } from "./UploadCsvSobreposicoes";
import { CardSobreposicao } from "./CardSobreposicao";
import { FiltrosSobreposicoes } from "./FiltrosSobreposicoes";
import { Paginacao } from "@/components/Paginacao";
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
  status: "pendente" | "ok" | "problema" | "solucionado";
  observacao: string | null;
  importado_em: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  solucionado_por_nome: string | null;
  solucionado_em: string | null;
  solucao: string | null;
  total_geral: number;
};

export default async function SobreposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; orgao?: string; ano?: string; tipologia?: string; tipologiaTodas?: string; ocultarEstradaVicinal?: string; grupo?: string; pagina?: string }>;
}) {
  const { status, orgao, ano, tipologia, tipologiaTodas, ocultarEstradaVicinal, grupo, pagina } = await searchParams;
  // Análise separada: locais com todas as obras concluídas ficam num grupo próprio.
  const grupoAtual = grupo === "concluidas" ? "concluidas" : "andamento";
  const statusAtual = status === "ok" || status === "problema" || status === "solucionado" ? status : "pendente";
  const anoFiltro = ano ? parseInt(ano, 10) : null;
  const ocultarEstradaVicinalAtual = ocultarEstradaVicinal === "1";
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
    { data: contagensRpc },
    { data: contagensOutroGrupo },
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: anosRpc },
    { data: tipologiasRpc },
    { data: equipeAtiva },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.from("sobreposicoes").select("chave_local", { count: "exact", head: true }).eq("status", "pendente"),
    // Números dos botões de status: seguem os filtros de órgão, ano e tipologia.
    supabase.rpc("sobreposicoes_contagens", {
      orgao_filtro: orgao || null,
      ano_filtro: anoFiltro,
      ocultar_estrada_vicinal: ocultarEstradaVicinalAtual,
      tipologia_filtro: tipologia || null,
      tipologia_todas_filtro: tipologiaTodas || null,
      grupo_situacao: grupoAtual,
    }),
    // Só para mostrar quantos aguardam revisão no outro grupo.
    supabase.rpc("sobreposicoes_contagens", {
      orgao_filtro: orgao || null,
      ano_filtro: anoFiltro,
      ocultar_estrada_vicinal: ocultarEstradaVicinalAtual,
      tipologia_filtro: tipologia || null,
      tipologia_todas_filtro: tipologiaTodas || null,
      grupo_situacao: grupoAtual === "concluidas" ? "andamento" : "concluidas",
    }),
    supabase.rpc("sobreposicoes_lista", {
      filtro_status: statusAtual,
      orgao_filtro: orgao || null,
      ano_filtro: anoFiltro,
      ocultar_estrada_vicinal: ocultarEstradaVicinalAtual,
      tipologia_filtro: tipologia || null,
      tipologia_todas_filtro: tipologiaTodas || null,
      grupo_situacao: grupoAtual,
      pagina: paginaAtual,
      tamanho: PAGE_SIZE,
    }),
    supabase.rpc("sobreposicoes_orgaos"),
    supabase.rpc("sobreposicoes_anos"),
    supabase.rpc("sobreposicoes_tipologias"),
    // Só admin enxerga os perfis de todo mundo (RLS); pros demais volta vazio.
    supabase.from("profiles").select("id, nome").eq("status", "aprovado").order("nome"),
  ]);
  const ehAdmin = !!profile?.is_admin;
  const equipe = ehAdmin ? ((equipeAtiva ?? []) as { id: string; nome: string }[]) : [];
  const usuario = { id: user!.id, nome: profile?.nome ?? "Você" };

  const linhasCsv = (linhasRpc ?? []) as LinhaSobreposicao[];

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
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);
  const anosDisponiveis = (anosRpc ?? []).map((r: { ano: number }) => r.ano);
  const tipologiasDisponiveis = (tipologiasRpc ?? []).map((r: { tipologia: string }) => r.tipologia);

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
      subtitulo={`${grupoAtual === "concluidas" ? "Concluída × Concluída" : "Em andamento"}: ${totalFiltrado} local(is), ${{ pendente: "aguardando revisão", ok: "sem problema", problema: "com problema", solucionado: "solucionado" }[statusAtual]}`}
    >
      <div className="mb-4">
        <UploadCsvSobreposicoes />
      </div>

      <div className="mb-4">
        <FiltrosSobreposicoes
          statusAtual={statusAtual}
          contagens={{ pendente: Number(contagensRpc?.[0]?.pendente ?? 0), ok: Number(contagensRpc?.[0]?.ok ?? 0), problema: Number(contagensRpc?.[0]?.problema ?? 0), solucionado: Number(contagensRpc?.[0]?.solucionado ?? 0) }}
          orgaoAtual={orgao ?? ""}
          orgaos={orgaosDisponiveis}
          anoAtual={ano ?? ""}
          tipologiaAtual={tipologia ?? ""}
          tipologiaTodasAtual={tipologiaTodas ?? ""}
          tipologias={tipologiasDisponiveis}
          anos={anosDisponiveis}
          ocultarEstradaVicinalAtual={ocultarEstradaVicinalAtual}
          grupoAtual={grupoAtual}
          pendentesPorGrupo={{
            [grupoAtual]: Number(contagensRpc?.[0]?.pendente ?? 0),
            [grupoAtual === "concluidas" ? "andamento" : "concluidas"]: Number(contagensOutroGrupo?.[0]?.pendente ?? 0),
          }}
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
            <p className="text-sm text-ink-muted">
              {statusAtual === "pendente" ? "Nenhuma sobreposição pendente. 🎉" : "Nenhum local nesta lista ainda."}
            </p>
          </div>
        )}

        <Paginacao
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          baseHref="/sobreposicoes"
          params={{
            status: statusAtual !== "pendente" ? statusAtual : undefined,
            orgao,
            ano,
            tipologia,
            grupo: grupoAtual === "concluidas" ? "concluidas" : undefined,
            tipologiaTodas,
            ocultarEstradaVicinal: ocultarEstradaVicinalAtual ? "1" : undefined,
          }}
        />
      </div>
    </AppShell>
  );
}

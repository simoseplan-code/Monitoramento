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
  status: "pendente" | "ok" | "problema";
  observacao: string | null;
  importado_em: string;
  total_geral: number;
};

export default async function SobreposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; orgao?: string; ano?: string; pagina?: string }>;
}) {
  const { status, orgao, ano, pagina } = await searchParams;
  const statusAtual = status === "ok" || status === "problema" ? status : "pendente";
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
    { count: totalOk },
    { count: totalProblema },
    { data: linhasRpc },
    { data: orgaosRpc },
    { data: anosRpc },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.from("sobreposicoes").select("chave_local", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("sobreposicoes").select("chave_local", { count: "exact", head: true }).eq("status", "ok"),
    supabase.from("sobreposicoes").select("chave_local", { count: "exact", head: true }).eq("status", "problema"),
    supabase.rpc("sobreposicoes_lista", {
      filtro_status: statusAtual,
      orgao_filtro: orgao || null,
      ano_filtro: anoFiltro,
      pagina: paginaAtual,
      tamanho: PAGE_SIZE,
    }),
    supabase.rpc("sobreposicoes_orgaos"),
    supabase.rpc("sobreposicoes_anos"),
  ]);

  const linhasCsv = (linhasRpc ?? []) as LinhaSobreposicao[];

  // O CSV do Mapa de Obras é uma foto do dia da exportação e só traz o
  // "Número do Contrato no SIAFE" digitado — o contrato de fato vinculado
  // fica em numero_automatico (é ele que a tela mostra). Contrato e status
  // vêm da base sincronizada (atual); o valor do CSV só vale se a ação não
  // for encontrada na base.
  const idsNaPagina = Array.from(new Set(linhasCsv.flatMap((l) => l.obras.map((o) => o.id).filter((id): id is string => !!id))));
  const { data: obrasVivas } =
    idsNaPagina.length > 0
      ? await supabase.from("obras").select("id_acao, numero_automatico, numero_siafe, status").in("id_acao", idsNaPagina)
      : { data: [] as { id_acao: string; numero_automatico: string | null; numero_siafe: string | null; status: string | null }[] };
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
      };
    }),
  }));
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
      subtitulo={`${totalFiltrado} local(is) — ${{ pendente: "aguardando revisão", ok: "sem problema", problema: "com problema" }[statusAtual]}`}
    >
      <div className="mb-4">
        <UploadCsvSobreposicoes />
      </div>

      <div className="mb-4">
        <FiltrosSobreposicoes
          statusAtual={statusAtual}
          contagens={{ pendente: totalPendentes ?? 0, ok: totalOk ?? 0, problema: totalProblema ?? 0 }}
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
              {statusAtual === "pendente" ? "Nenhuma sobreposição pendente. 🎉" : "Nenhum local nesta lista ainda."}
            </p>
          </div>
        )}

        <Paginacao
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          baseHref="/sobreposicoes"
          params={{ status: statusAtual !== "pendente" ? statusAtual : undefined, orgao, ano }}
        />
      </div>
    </AppShell>
  );
}

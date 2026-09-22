import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CardSugestaoUnidade } from "./CardSugestaoUnidade";
import { FiltrosUnidadeQuantidade } from "./FiltrosUnidadeQuantidade";
import { PaginacaoUnidadeQuantidade } from "./PaginacaoUnidadeQuantidade";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { contarSugestoesUnidadePendentes } from "@/lib/unidadeQuantidade";

const PAGE_SIZE = 50;

type LinhaSugestao = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  tipologia: string | null;
  unidade_atual: string | null;
  quantidade_atual: string | null;
  unidade_sugerida: string;
  quantidade_sugerida: string | null;
  sem_quantidade: boolean;
  confianca: "alta" | "baixa";
  aviso_tipologia: boolean;
  motivo: string;
  aprovado: boolean;
  aplicado_em: string | null;
  total_geral: number;
};

export default async function UnidadeQuantidadePage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; orgao?: string; confianca?: string; todas?: string; pagina?: string }>;
}) {
  const { busca, orgao, confianca, todas, pagina } = await searchParams;
  const mostrarTodas = todas === "1";
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
    sugestoesUnidadePendentes,
    { data: linhasRpc },
    { data: orgaosRpc },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    contarSugestoesUnidadePendentes(supabase),
    supabase.rpc("unidade_sugestao_lista", {
      busca: busca || null,
      orgao_filtro: orgao || null,
      confianca_filtro: confianca || null,
      so_pendentes_aprovacao: !mostrarTodas,
      pagina: paginaAtual,
      tamanho: PAGE_SIZE,
    }),
    supabase.rpc("unidade_sugestao_orgaos"),
  ]);

  const linhas = (linhasRpc ?? []) as LinhaSugestao[];
  const totalGeral = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalGeral / PAGE_SIZE));
  const orgaosDisponiveis = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{
        acoes: totalAcoes ?? 0,
        pendentesAprovacao: pendentesAprovacao ?? 0,
        novasAcoesPendentes,
        sugestoesUnidadePendentes,
      }}
      titulo="Unidade / Quantidade"
      subtitulo={`${totalGeral} ação(ões)${mostrarTodas ? "" : " aguardando revisão"} com Unidade de Medida vazia ou divergente da sugestão`}
    >
      <div className="mb-4">
        <FiltrosUnidadeQuantidade
          buscaAtual={busca ?? ""}
          orgaoAtual={orgao ?? ""}
          confiancaAtual={confianca ?? ""}
          orgaos={orgaosDisponiveis}
          mostrarTodas={mostrarTodas}
        />
      </div>

      <div className="space-y-3">
        {linhas.map((s) => (
          <CardSugestaoUnidade
            key={s.id_acao}
            idAcao={s.id_acao}
            nomeAcao={s.nome_acao}
            orgao={s.orgao}
            tipologia={s.tipologia}
            unidadeAtual={s.unidade_atual}
            quantidadeAtual={s.quantidade_atual}
            unidadeSugerida={s.unidade_sugerida}
            quantidadeSugerida={s.quantidade_sugerida}
            semQuantidade={s.sem_quantidade}
            confianca={s.confianca}
            avisoTipologia={s.aviso_tipologia}
            motivo={s.motivo}
            aprovado={s.aprovado}
            aplicadoEm={s.aplicado_em}
          />
        ))}

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">Nenhuma sugestão pendente. 🎉</p>
          </div>
        )}

        <PaginacaoUnidadeQuantidade
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          busca={busca ?? ""}
          orgao={orgao ?? ""}
          confianca={confianca ?? ""}
          todas={mostrarTodas}
        />
      </div>
    </AppShell>
  );
}

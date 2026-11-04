import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { territoriosDasAcoes, territorioPorMunicipio } from "@/lib/territoriosDados";
import type { AcaoT } from "@/lib/analiseTerritorio";
import { AnaliseTerritorio } from "./AnaliseTerritorio";

const COLUNAS =
  "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, tipo_outros_documentos, acao_conveniada, percentual_execucao, numero_automatico, numero_siafe, data_criacao, data_receb_definitivo, data_receb_provisorio, valor_original, valor_total, extra";

type Linha = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipo_outros_documentos: string | null;
  acao_conveniada: string | null;
  percentual_execucao: number | string | null;
  numero_automatico: string | null;
  numero_siafe: string | null;
  data_criacao: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
  extra: Record<string, string> | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const limpo = (v: string | null) => {
  const s = (v ?? "").trim();
  return s && s !== "-" ? s : null;
};

// Aberta a toda a equipe aprovada. Todas as ações (as desconsideradas em "Todas as análises" já ficam de fora pelo banco).
export default async function AnaliseTerritorioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
  ]);

  const linhas: Linha[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("obras").select(COLUNAS).order("id_acao").range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as unknown as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const extras = new Map<string, Record<string, string> | null>(linhas.map((l) => [l.id_acao, l.extra]));
  const { porAcao, erro: erroTerr } = await territoriosDasAcoes(supabase, extras);
  erro = erro ?? erroTerr;
  const territorios = Array.from(new Set((await territorioPorMunicipio()).values())).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const acoes: AcaoT[] = linhas.map((l) => {
    const t = porAcao.get(l.id_acao);
    return {
      id: l.id_acao,
      nome: l.nome_acao ?? "",
      orgao: l.orgao,
      status: l.status,
      estagio: l.estagio_atual,
      tipologia: l.tipologia,
      classificacao: l.classificacao,
      tipoOutros: l.tipo_outros_documentos,
      conveniada: l.acao_conveniada,
      pct: numero(l.percentual_execucao),
      numeroAutomatico: limpo(l.numero_automatico),
      numeroSiafe: limpo(l.numero_siafe),
      criadaEm: l.data_criacao,
      recDef: l.data_receb_definitivo,
      recProv: l.data_receb_provisorio,
      original: numero(l.valor_original),
      total: numero(l.valor_total),
      partes: t?.partes ?? [],
      origem: t?.origem ?? "nenhuma",
      extensaoM: t?.extensaoM ?? 0,
    };
  });

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Análise por território"
      subtitulo={`${acoes.length.toLocaleString("pt-BR")} ação(ões) nos 12 territórios de desenvolvimento`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar os dados: {erro}</p>
      ) : (
        <AnaliseTerritorio acoes={acoes} territorios={territorios} />
      )}
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import type { ObraConcluida } from "@/lib/analiseConcluidas";
import { AnaliseConcluidas } from "./AnaliseConcluidas";

const COLUNAS =
  "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, tipo_outros_documentos, acao_conveniada, percentual_execucao, data_receb_definitivo, data_receb_provisorio, valor_original, valor_total";

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
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export default async function AnaliseConcluidasPage() {
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

  // Só admin e chefe.
  if (!profile?.is_admin) redirect("/");

  // Todas as obras que têm recebimento (definitivo ou provisório), lidas em páginas.
  const linhas: Linha[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("obras")
      .select(COLUNAS)
      .or("data_receb_definitivo.not.is.null,data_receb_provisorio.not.is.null")
      .order("id_acao")
      .range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  // Filtro que a pessoa gravou (se o SQL 0079 ainda não foi rodado, simplesmente não há).
  const { data: gravado } = await supabase.from("filtros_salvos").select("estado, atualizado_em").eq("usuario_id", user!.id).eq("tela", "analise_concluidas").maybeSingle();
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string } : null;

  const obras: ObraConcluida[] = linhas.map((l) => ({
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
    recDef: l.data_receb_definitivo,
    recProv: l.data_receb_provisorio,
    original: numero(l.valor_original),
    total: numero(l.valor_total),
  }));

  return (
    <AppShell
      nome={profile.nome ?? "Usuário"}
      cargo={profile.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Análise de obras concluídas"
      subtitulo={`${obras.length.toLocaleString("pt-BR")} obra(s) com recebimento definitivo ou provisório`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          Falha ao carregar os dados: {erro}. Se a mensagem fala de coluna que não existe, rode o SQL 0078 e sincronize com o SIMO.
        </p>
      ) : (
        <AnaliseConcluidas obras={obras} filtroGravado={filtroGravado} />
      )}
    </AppShell>
  );
}

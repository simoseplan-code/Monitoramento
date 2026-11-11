import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { auditar, normalizarUnidade, type ObraAuditoria } from "@/lib/auditoriaQuantitativo";
import { revestimentoDoNome, servicoDoNome, type ObraCusto } from "@/lib/custosUnitarios";
import { dinheiroParaNumero } from "@/lib/simo/parseCsv";
import { AnaliseCustos } from "./AnaliseCustos";

const COLUNAS = "id_acao, nome_acao, descricao_acao, orgao, status, tipologia, classificacao, unidade_medida, quantidade, valor_original, valor_total, data_criacao, data_receb_definitivo, data_receb_provisorio, extra";

type Obra = {
  id_acao: string;
  nome_acao: string | null;
  descricao_acao: string | null;
  orgao: string | null;
  status: string | null;
  tipologia: string | null;
  classificacao: string | null;
  unidade_medida: string | null;
  quantidade: number | string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
  data_criacao: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  extra: Record<string, string> | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function valorPagoDe(extra: Record<string, string> | null): number | null {
  if (!extra) return null;
  const chave = Object.keys(extra).find((k) => /valor\s*pago/i.test(k));
  return chave ? dinheiroParaNumero(extra[chave]) : null;
}

async function lerTudo<T>(consulta: (de: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de);
    if (error) return { linhas, erro: error.message };
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { linhas, erro: null };
}

// Sinais da auditoria que tornam o custo por unidade pouco confiável (quantidade ou unidade provavelmente erradas).
const CODIGOS_SUSPEITOS = new Set(["quantidade_absurda", "quantidade_outlier", "custo_unitario", "quantidade_texto", "unidade_texto", "unidade_tipologia", "unidade_minoria", "km_tracado", "quantidade_zero"]);

// Análise de custos: só admin e chefe.
export default async function AnaliseCustosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single();
  if (!profile?.is_admin) redirect("/");

  const [{ count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes] = await Promise.all([
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
  ]);

  const obras = await lerTudo<Obra>((de) => supabase.from("obras").select(COLUNAS).order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Obra[] | null; error: { message: string } | null }>);

  const admin = createAdminClient();
  type Kml = { id_acao: string; extensao_km: number | string | null };
  const kmls = await lerTudo<Kml>((de) => admin.from("kml_arquivos").select("id_acao, extensao_km").eq("situacao", "baixado").gt("extensao_km", 0).order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Kml[] | null; error: { message: string } | null }>);
  const kml = new Map<string, number>();
  for (const k of kmls.linhas) {
    const v = numero(k.extensao_km);
    if (v != null) kml.set(k.id_acao, v);
  }
  type Ign = { id_acao: string };
  const ign = await lerTudo<Ign>((de) => admin.from("auditoria_ignoradas").select("id_acao").order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Ign[] | null; error: { message: string } | null }>);
  const ignoradas = new Set(ign.linhas.map((i) => i.id_acao));

  // A mesma auditoria da "Nova análise em teste" aponta as ações em que a quantidade/unidade parece errada.
  const entrada: ObraAuditoria[] = obras.linhas.map((o) => ({
    id: o.id_acao,
    nome: o.nome_acao ?? "",
    descricao: o.descricao_acao,
    orgao: o.orgao,
    status: o.status,
    estagio: null,
    tipologia: o.tipologia,
    classificacao: o.classificacao,
    unidade: o.unidade_medida,
    quantidade: numero(o.quantidade),
    valor: numero(o.valor_total) ?? numero(o.valor_original),
    kmKml: kml.get(o.id_acao) ?? null,
  }));
  const { linhas } = auditar(entrada);
  const suspeitas = new Map<string, string[]>();
  for (const l of linhas) {
    if (ignoradas.has(l.id)) continue;
    const achados = l.achados.filter((a) => CODIGOS_SUSPEITOS.has(a.codigo));
    if (achados.length) suspeitas.set(l.id, achados.map((a) => `${a.titulo}: ${a.detalhe}`));
  }

  const lista: ObraCusto[] = [];
  for (const o of obras.linhas) {
    const un = normalizarUnidade(o.unidade_medida);
    const q = numero(o.quantidade);
    if (!un || q == null || q <= 0) continue;
    const nome = o.nome_acao ?? "";
    lista.push({
      id: o.id_acao,
      nome: nome.length > 150 ? nome.slice(0, 147) + "..." : nome,
      orgao: o.orgao,
      status: o.status,
      classificacao: o.classificacao,
      tipologia: o.tipologia,
      unidade: un,
      quantidade: q,
      contratado: numero(o.valor_original),
      final: numero(o.valor_total),
      pago: valorPagoDe(o.extra),
      anoReceb: ((o.data_receb_provisorio || o.data_receb_definitivo) ?? "").slice(0, 4) || null,
      anoCriacao: (o.data_criacao ?? "").slice(0, 4) || null,
      revestimento: revestimentoDoNome(`${nome} ${o.descricao_acao ?? ""}`),
      servico: servicoDoNome(nome),
      suspeita: suspeitas.has(o.id_acao),
      motivos: suspeitas.get(o.id_acao) ?? [],
    });
  }

  const { data: gravado } = await admin.from("filtros_salvos").select("usuario_id, estado, atualizado_em").eq("tela", "analise_custos").order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  let gravadoPor: string | null = null;
  if (gravado?.usuario_id) {
    const { data: quem } = await admin.from("profiles").select("nome").eq("id", gravado.usuario_id).maybeSingle();
    gravadoPor = (quem?.nome as string | null) ?? null;
  }
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string, por: gravadoPor } : null;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Análise de custos"
      subtitulo={`Custo por unidade (R$ por m², km, unidade...) de ${lista.length.toLocaleString("pt-BR")} ação(ões) com quantidade e unidade`}
    >
      {obras.erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar os dados: {obras.erro}</p>
      ) : (
        <AnaliseCustos obras={lista} anoHoje={new Date().getFullYear()} filtroGravado={filtroGravado} />
      )}
    </AppShell>
  );
}

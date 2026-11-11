import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { auditar, type ObraAuditoria } from "@/lib/auditoriaQuantitativo";
import { NovaAnaliseTeste } from "./NovaAnaliseTeste";

const COLUNAS = "id_acao, nome_acao, descricao_acao, orgao, status, estagio_atual, tipologia, classificacao, unidade_medida, quantidade, valor_original, valor_total";

type Obra = {
  id_acao: string;
  nome_acao: string | null;
  descricao_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  unidade_medida: string | null;
  quantidade: number | string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

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

// "Nova análise em teste": auditoria da base inteira de tipologia x unidade x quantidade (lib/auditoriaQuantitativo.ts).
export default async function NovaAnaliseTestePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single();

  const [{ count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes] = await Promise.all([
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
  ]);

  const obras = await lerTudo<Obra>((de) => supabase.from("obras").select(COLUNAS).order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Obra[] | null; error: { message: string } | null }>);

  // Extensão (km) das linhas do KML guardado de cada ação, para comparar com a quantidade em km.
  const admin = createAdminClient();
  const kml = new Map<string, number>();
  type Kml = { id_acao: string; extensao_km: number | string | null };
  const kmls = await lerTudo<Kml>((de) => admin.from("kml_arquivos").select("id_acao, extensao_km").eq("situacao", "baixado").gt("extensao_km", 0).order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Kml[] | null; error: { message: string } | null }>);
  for (const k of kmls.linhas) {
    const v = numero(k.extensao_km);
    if (v != null) kml.set(k.id_acao, v);
  }

  const entrada: ObraAuditoria[] = obras.linhas.map((o) => ({
    id: o.id_acao,
    nome: o.nome_acao ?? "",
    descricao: o.descricao_acao,
    orgao: o.orgao,
    status: o.status,
    estagio: o.estagio_atual,
    tipologia: o.tipologia,
    classificacao: o.classificacao,
    unidade: o.unidade_medida,
    quantidade: numero(o.quantidade),
    valor: numero(o.valor_total) ?? numero(o.valor_original),
    kmKml: kml.get(o.id_acao) ?? null,
  }));
  const { linhas, tipologias } = auditar(entrada);

  // Filtro gravado: UM SÓ, vale para todos (quem gravou por último).
  const { data: gravado } = await admin.from("filtros_salvos").select("usuario_id, estado, atualizado_em").eq("tela", "nova_analise_teste").order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  let gravadoPor: string | null = null;
  if (gravado?.usuario_id) {
    const { data: quem } = await admin.from("profiles").select("nome").eq("id", gravado.usuario_id).maybeSingle();
    gravadoPor = (quem?.nome as string | null) ?? null;
  }
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string, por: gravadoPor } : null;

  // Só o que a tela precisa (o texto longo da descrição fica no servidor).
  const enxutas = linhas.map((l) => ({ ...l, nome: l.nome.length > 160 ? l.nome.slice(0, 157) + "..." : l.nome }));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Nova análise em teste"
      subtitulo={`Auditoria de tipologia, unidade de medida e quantidade · ${linhas.length.toLocaleString("pt-BR")} ação(ões) analisadas`}
    >
      {obras.erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar os dados: {obras.erro}</p>
      ) : (
        <NovaAnaliseTeste linhas={enxutas} tipologias={tipologias} filtroGravado={filtroGravado} />
      )}
    </AppShell>
  );
}

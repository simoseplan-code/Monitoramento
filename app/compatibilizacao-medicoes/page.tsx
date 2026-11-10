import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { dinheiroParaNumero } from "@/lib/simo/parseCsv";
import { Compatibilizacao, type LinhaMedicao } from "./Compatibilizacao";

const COLUNAS = "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, tipo_outros_documentos, acao_conveniada, unidade_medida, quantidade, numero_automatico, numero_siafe, data_criacao, data_receb_definitivo, data_receb_provisorio, valor_original, valor_total, percentual_execucao, extra, eixo:extra->>EIXO";

type Obra = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipo_outros_documentos: string | null;
  acao_conveniada: string | null;
  unidade_medida: string | null;
  quantidade: number | string | null;
  numero_automatico: string | null;
  numero_siafe: string | null;
  data_criacao: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  eixo: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
  percentual_execucao: number | string | null;
  extra: Record<string, string> | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const VAZIO = "(vazio)";
const ou = (v: string | null | undefined) => (v && v.trim() !== "" && v.trim() !== "-" ? v.trim() : VAZIO);

// Colunas "Localização (município)" e "Localização (território)" do relatório do SIMO; o SIMO junta vários valores com " - " (ou ";").
function listaSimo(extra: Record<string, string> | null, tipo: RegExp): string[] {
  if (!extra) return [];
  const chaves = Object.keys(extra);
  const chave = chaves.find((k) => /localiza/i.test(k) && tipo.test(k)) ?? chaves.find((k) => tipo.test(k) && !/bairro/i.test(k));
  if (!chave) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const parte of extra[chave].split(/s+-s+|s*;s*/)) {
    const nome = parte.trim();
    const k = nome.toLowerCase();
    if (nome && nome !== "-" && !vistos.has(k)) {
      vistos.add(k);
      saida.push(nome);
    }
  }
  return saida;
}

// "Valor medido do estágio": coluna do relatório do SIMO com o valor medido da ação (o "Medido" do topo da ação).
// Fica em "extra" (cabeçalho como no SIMO). Procura a coluna de valor cujo nome tem "medid", sem as de percentual.
function colunaMedido(chaves: string[]): string | null {
  const candidatas = chaves.filter((k) => /medid/i.test(k) && !/%|percent|perc\.|data|qtd|quant/i.test(k));
  return candidatas.find((k) => /valor/i.test(k)) ?? candidatas[0] ?? null;
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

export default async function CompatibilizacaoMedicoesPage() {
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
  type Boletim = { id_acao: string; id_simo: string; numero: string | null; data: string | null; tipo: string | null; responsavel: string | null; valor: number | string };
  type Leitura = { id_acao: string; lido_em: string; qtd_boletins: number; erro: string | null; valor_medido: number | string | null; valor_total: number | string | null };
  const boletins = await lerTudo<Boletim>((de) => supabase.from("medicoes_simo").select("id_acao, id_simo, numero, data, tipo, responsavel, valor").order("id_acao").order("id_simo").range(de, de + 999) as unknown as PromiseLike<{ data: Boletim[] | null; error: { message: string } | null }>);
  const leituras = await lerTudo<Leitura>((de) => supabase.from("medicoes_leitura").select("id_acao, lido_em, qtd_boletins, erro, valor_medido, valor_total").order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Leitura[] | null; error: { message: string } | null }>);

  // Tabelas ainda não criadas (SQL 0098 não rodado): avisa em vez de quebrar a tela.
  const semTabelas = /medicoes_(simo|leitura)|valor_medido/i.test((boletins.erro ?? "") + (leituras.erro ?? ""));
  const erro = obras.erro ?? (semTabelas ? null : (boletins.erro ?? leituras.erro));

  const porAcao = new Map<string, LinhaMedicao["boletins"]>();
  for (const b of boletins.linhas) {
    const lista = porAcao.get(b.id_acao) ?? [];
    lista.push({ numero: b.numero ?? "", data: b.data, tipo: b.tipo ?? "", responsavel: b.responsavel ?? "", valor: Number(b.valor) || 0 });
    porAcao.set(b.id_acao, lista);
  }
  const leituraDe = new Map(leituras.linhas.map((l) => [l.id_acao, l]));

  const chavesExtra = new Set<string>();
  for (const o of obras.linhas) if (o.extra) for (const k of Object.keys(o.extra)) chavesExtra.add(k);
  const chaveMedido = colunaMedido(Array.from(chavesExtra));

  const linhas: LinhaMedicao[] = obras.linhas.map((o) => {
    const l = leituraDe.get(o.id_acao);
    const bruto = chaveMedido && o.extra ? o.extra[chaveMedido] : null;
    const doSimo = numero(l?.valor_medido ?? null);
    const original = numero(o.valor_original);
    const final = numero(o.valor_total) ?? original;
    const recebimento = (o.data_receb_provisorio || o.data_receb_definitivo || "").slice(0, 4);
    const municipios = listaSimo(o.extra, /munic/i);
    const territorios = listaSimo(o.extra, /territ/i);
    return {
      id: o.id_acao,
      nome: o.nome_acao ?? "",
      orgao: o.orgao,
      status: o.status,
      estagio: o.estagio_atual,
      tipologia: o.tipologia,
      classificacao: o.classificacao,
      contratado: numero(o.valor_original),
      // O valor lido do SIMO junto com os boletins vale mais; sem ele, a coluna do relatório (se houver).
      medidoEstagio: doSimo ?? (bruto != null && String(bruto).trim() !== "" && String(bruto).trim() !== "-" ? dinheiroParaNumero(String(bruto)) : null),
      pct: numero(o.percentual_execucao),
      // Valor total da ação (com aditivos): o do relatório; sem ele, o valor original; sem os dois, o "Valor Total" lido do SIMO.
      valorBase: [numero(o.valor_total), original, numero(l?.valor_total ?? null)].find((v) => v != null && v > 0) ?? null,
      unidade: o.unidade_medida && o.unidade_medida.trim() && o.unidade_medida.trim() !== "-" ? o.unidade_medida.trim().toUpperCase() : null,
      quantidade: numero(o.quantidade),
      campos: {
        eixo: [ou(o.eixo)],
        conveniada: [ou(o.acao_conveniada)],
        tipoOutros: [ou(o.tipo_outros_documentos)],
        unidade: [ou(o.unidade_medida?.toUpperCase())],
        anoCriacao: [(o.data_criacao ?? "").slice(0, 4) || VAZIO],
        anoReceb: [recebimento || VAZIO],
        vinculacao: [o.numero_automatico ? "Vinculada" : o.numero_siafe ? "Pendente" : "Sem número"],
        aditivo: [original == null ? "Sem valor informado" : final! - original > 0.005 ? "Com aditivo" : final! - original < -0.005 ? "Com supressão" : "Sem aditivo"],
        municipio: municipios.length ? municipios : [VAZIO],
        territorio: territorios.length ? territorios : [VAZIO],
      },
      lida: !!l,
      lidoEm: l?.lido_em ?? null,
      erroLeitura: l?.erro ?? null,
      boletins: (porAcao.get(o.id_acao) ?? []).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
    };
  });

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Compatibilização de medições"
      subtitulo={`Boletins de medição lidos do SIMO comparados com o valor medido da ação · ${linhas.length.toLocaleString("pt-BR")} ação(ões)`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar os dados: {erro}</p>
      ) : (
        <Compatibilizacao linhas={linhas} chaveMedido={chaveMedido} ehAdmin={!!profile?.is_admin} semTabelas={semTabelas} />
      )}
    </AppShell>
  );
}

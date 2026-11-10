import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { dinheiroParaNumero } from "@/lib/simo/parseCsv";
import { Compatibilizacao, type LinhaMedicao } from "./Compatibilizacao";

const COLUNAS = "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, numero_automatico, valor_original, valor_total, percentual_execucao, extra";

type Obra = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  numero_automatico: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
  percentual_execucao: number | string | null;
  extra: Record<string, string> | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

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
  type Leitura = { id_acao: string; lido_em: string; qtd_boletins: number; erro: string | null };
  const boletins = await lerTudo<Boletim>((de) => supabase.from("medicoes_simo").select("id_acao, id_simo, numero, data, tipo, responsavel, valor").order("id_acao").order("id_simo").range(de, de + 999) as unknown as PromiseLike<{ data: Boletim[] | null; error: { message: string } | null }>);
  const leituras = await lerTudo<Leitura>((de) => supabase.from("medicoes_leitura").select("id_acao, lido_em, qtd_boletins, erro").order("id_acao").range(de, de + 999) as unknown as PromiseLike<{ data: Leitura[] | null; error: { message: string } | null }>);

  // Tabelas ainda não criadas (SQL 0098 não rodado): avisa em vez de quebrar a tela.
  const semTabelas = /medicoes_(simo|leitura)/i.test((boletins.erro ?? "") + (leituras.erro ?? ""));
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
    return {
      id: o.id_acao,
      nome: o.nome_acao ?? "",
      orgao: o.orgao,
      status: o.status,
      estagio: o.estagio_atual,
      tipologia: o.tipologia,
      classificacao: o.classificacao,
      contratado: numero(o.valor_original),
      medidoEstagio: bruto != null && String(bruto).trim() !== "" && String(bruto).trim() !== "-" ? dinheiroParaNumero(String(bruto)) : null,
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

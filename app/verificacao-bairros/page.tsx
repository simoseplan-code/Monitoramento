import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { idsDesconsiderados } from "@/lib/desconsideradas";
import { VerificacaoBairros, type ItemLista, type LinhaLista } from "./VerificacaoBairros";

export default async function VerificacaoBairrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: resumoRpc }] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("bairros_resumo"),
  ]);

  // Uma linha por ação e bairro (ou uma linha sem bairro), lidas em páginas.
  const linhas: LinhaLista[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acao_bairros_lista").select("*").order("id_acao").range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as LinhaLista[]));
    if (!data || data.length < 1000) break;
  }

  // Data de criação e ano de conclusão (recebimento provisório; se não houver, o definitivo).
  const datas = new Map<string, { criada: string | null; conclusao: string }>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("obras").select("id_acao, data_criacao, data_receb_definitivo, data_receb_provisorio").order("id_acao").range(de, de + 999);
    if (error) {
      erro = erro ?? error.message;
      break;
    }
    for (const o of data ?? []) {
      const rec = (o.data_receb_provisorio as string | null) || (o.data_receb_definitivo as string | null);
      datas.set(o.id_acao as string, { criada: (o.data_criacao as string | null) ?? null, conclusao: rec ? rec.slice(0, 4) : "(vazio)" });
    }
    if (!data || data.length < 1000) break;
  }

  const porAcao = new Map<string, ItemLista>();
  for (const l of linhas) {
    let item = porAcao.get(l.id_acao);
    if (!item) {
      item = {
        id: l.id_acao,
        nome: l.nome_acao ?? "",
        orgao: l.orgao,
        status: l.status,
        fonte: l.fonte,
        extensaoM: l.extensao_m,
        metrosFora: l.metros_fora,
        pontosFora: l.pontos_fora ?? 0,
        semBairro: [],
        zona: { metrosUrbano: l.metros_urbano ?? 0, metrosRural: l.metros_rural ?? 0, pontosUrbano: l.pontos_urbano ?? 0, pontosRural: l.pontos_rural ?? 0 },
        criadaEm: datas.get(l.id_acao)?.criada ?? null,
        anoConclusao: datas.get(l.id_acao)?.conclusao ?? "(vazio)",
        bairros: [],
      };
      porAcao.set(l.id_acao, item);
    }
    // bairro vazio = parte que está no município mas em nenhum bairro do arquivo
    if (l.municipio && l.bairro === "") item.semBairro.push({ municipio: l.municipio, metros: l.metros ?? 0, pct: l.pct ?? 0, pontos: l.pontos ?? 0 });
    else if (l.bairro && l.municipio) item.bairros.push({ municipio: l.municipio, bairro: l.bairro, metros: l.metros ?? 0, pct: l.pct ?? 0, pontos: l.pontos ?? 0 });
  }
  // IDs que a equipe desconsiderou (lista desta análise + lista "Todas").
  const fora = new Set(await idsDesconsiderados(supabase, "bairros"));
  const itens = Array.from(porAcao.values()).filter((i) => !fora.has(i.id));
  for (const i of itens) i.bairros.sort((a, b) => b.metros - a.metros);

  const resumo = (Array.isArray(resumoRpc) ? resumoRpc[0] : resumoRpc) as { verificadas: number; pendentes: number; ultima: string | null } | null;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Verificação de bairros"
      subtitulo={`${itens.length.toLocaleString("pt-BR")} ação(ões) com traçado verificado`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          Falha ao carregar: {erro}. Se a mensagem fala de tabela que não existe, rode o SQL 0081.
        </p>
      ) : (
        <VerificacaoBairros itens={itens} ehAdmin={!!profile?.is_admin} resumo={resumo ? { verificadas: Number(resumo.verificadas), pendentes: Number(resumo.pendentes), ultima: resumo.ultima } : null} />
      )}
    </AppShell>
  );
}

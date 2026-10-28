import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
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
        bairros: [],
      };
      porAcao.set(l.id_acao, item);
    }
    if (l.bairro && l.municipio) item.bairros.push({ municipio: l.municipio, bairro: l.bairro, metros: l.metros ?? 0, pct: l.pct ?? 0 });
  }
  const itens = Array.from(porAcao.values());
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

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { TELAS_DESCONSIDERADAS, listarDesconsideradas } from "@/lib/desconsideradas";
import { AcoesDesconsideradas } from "./AcoesDesconsideradas";

// Aberta a toda a equipe aprovada: todas as listas de IDs desconsiderados, uma aba por análise.
export default async function AcoesDesconsideradasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, todas] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    listarDesconsideradas(
      supabase,
      TELAS_DESCONSIDERADAS.map((t) => t.chave)
    ),
  ]);

  // De qual ação mãe cada filha é filha (Configuração de TD).
  const maes: Record<string, string> = {};
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("td_acoes_filha").select("id_acao, id_acao_mae").order("id_acao").range(de, de + 999);
    if (error) break;
    for (const f of data ?? []) maes[f.id_acao as string] = f.id_acao_mae as string;
    if (!data || data.length < 1000) break;
  }

  const listas: Record<string, { id: string; em: string; por: string | null; nome: string | null; orgao: string | null; status: string | null; origem: "manual" | "filha" }[]> = {};
  for (const t of TELAS_DESCONSIDERADAS) listas[t.chave] = [];
  for (const l of todas) {
    const { tela, ...resto } = l;
    (listas[tela] ??= []).push(resto);
  }
  const total = new Set(todas.map((l) => l.id)).size;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Ações desconsideradas"
      subtitulo={`${total.toLocaleString("pt-BR")} ação(ões) tiradas de alguma análise`}
    >
      <AcoesDesconsideradas listas={listas} ehAdmin={!!profile?.is_admin} maes={maes} />
    </AppShell>
  );
}

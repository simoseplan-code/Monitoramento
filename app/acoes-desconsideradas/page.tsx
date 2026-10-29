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

  const listas: Record<string, { id: string; em: string; por: string | null; nome: string | null; orgao: string | null; status: string | null }[]> = {};
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
      <AcoesDesconsideradas listas={listas} ehAdmin={!!profile?.is_admin} />
    </AppShell>
  );
}

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { carregarAcoes } from "@/lib/acoesDados";
import { AcoesFiltradas } from "./AcoesFiltradas";

export default async function AcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; filtro?: string; orgao?: string }>;
}) {
  const { busca, filtro, orgao } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: pendentesAprovacao }, novasAcoesPendentes, { acoes, erro }, { data: gravado }] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    carregarAcoes(supabase),
    // Filtro que a pessoa gravou (se o SQL 0079 ainda não foi rodado, simplesmente não há).
    supabase.from("filtros_salvos").select("estado, atualizado_em").eq("usuario_id", user!.id).eq("tela", "acoes").maybeSingle(),
  ]);
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string } : null;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: acoes.length, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Ações"
      subtitulo={`${acoes.length.toLocaleString("pt-BR")} ação(ões) na base`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar as ações: {erro}</p>
      ) : (
        <AcoesFiltradas acoes={acoes} filtroGravado={filtroGravado} inicial={{ busca, filtro, orgao }} />
      )}
    </AppShell>
  );
}

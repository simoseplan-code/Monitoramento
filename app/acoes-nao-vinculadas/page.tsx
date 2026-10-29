import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { carregarAcoes } from "@/lib/acoesDados";
import { AcoesFiltradas } from "@/app/acoes/AcoesFiltradas";

// Ações sem número automático (não vinculadas ao SIAFE): pendentes (têm nº SIAFE, mas sem vínculo) e
// sem número. Aberta a toda a equipe aprovada, com os mesmos filtros da tela Ações.
export default async function AcoesNaoVinculadasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: pendentesAprovacao }, novasAcoesPendentes, { acoes, erro }, { data: gravado }, desconsideradas] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    carregarAcoes(supabase),
    // Filtro (e IDs desconsiderados) que a pessoa gravou.
    supabase.from("filtros_salvos").select("estado, atualizado_em").eq("usuario_id", user!.id).eq("tela", "acoes_nao_vinculadas").maybeSingle(),
    // IDs que a equipe desconsiderou (lista compartilhada; se o SQL 0085 ainda não rodou, vem vazia).
    (async () => {
      const lista: { id: string; em: string; por: string | null }[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao, desconsiderada_em, por_nome").eq("tela", "nao_vinculadas").order("id_acao").range(de, de + 999);
        if (error) break;
        for (const r of data ?? []) lista.push({ id: r.id_acao as string, em: r.desconsiderada_em as string, por: (r.por_nome as string | null) ?? null });
        if (!data || data.length < 1000) break;
      }
      return lista;
    })(),
  ]);
  const naoVinculadas = acoes.filter((a) => !a.numeroAutomatico);
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string } : null;

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: acoes.length, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Ações não vinculadas ao SIAFE"
      subtitulo={`${naoVinculadas.length.toLocaleString("pt-BR")} ação(ões) sem número automático`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar as ações: {erro}</p>
      ) : (
        <AcoesFiltradas acoes={naoVinculadas} filtroGravado={filtroGravado} inicial={{}} modo="nao_vinculadas" desconsideradas={desconsideradas} />
      )}
    </AppShell>
  );
}

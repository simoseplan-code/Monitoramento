import type { SupabaseClient } from "@supabase/supabase-js";
import { ehRecursoHidrico } from "@/lib/hidricos";

export type AcessoTerritorio = {
  /** Pode usar as telas e APIs do mapa (equipe aprovada ou DIGEPI). */
  liberado: boolean;
  /** Função DIGEPI: só enxerga as tipologias de recursos hídricos. */
  digepi: boolean;
  /** Admin ou chefe: vê o traçado de todas as tipologias. Os demais só o de recursos hídricos. */
  supervisor: boolean;
};

/** Quem é a pessoa para as telas de mapa: equipe aprovada ou DIGEPI (status 'digepi'). Os demais ficam sem acesso. */
export async function acessoDoUsuario(supabase: SupabaseClient, userId: string): Promise<AcessoTerritorio> {
  const { data } = await supabase.from("profiles").select("status, is_admin").eq("id", userId).single();
  const status = data?.status as string | undefined;
  return { liberado: status === "aprovado" || status === "digepi", digepi: status === "digepi", supervisor: status === "aprovado" && !!data?.is_admin };
}

/** Das ações pedidas, só as de tipologia de recurso hídrico (lido pelo servidor, com acesso de administração). */
export async function idsHidricos(admin: SupabaseClient, ids: string[]): Promise<string[]> {
  const ok: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("obras").select("id_acao, tipologia").in("id_acao", ids.slice(i, i + 200));
    for (const r of data ?? []) if (ehRecursoHidrico(r.tipologia as string | null)) ok.push(r.id_acao as string);
  }
  return ok;
}

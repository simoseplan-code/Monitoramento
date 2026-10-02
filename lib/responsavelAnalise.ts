import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type Responsavel =
  | { ok: true; responsavelId: string; ehAdmin: boolean; editandoPorOutro: boolean }
  | { ok: false; status: number; error: string };

export type AlvoResponsavel = { tabela: string; coluna: string };
export const ALVO_NOVAS_ACOES: AlvoResponsavel = { tabela: "obras_revisao", coluna: "id_acao" };
export const ALVO_SOBREPOSICOES: AlvoResponsavel = { tabela: "sobreposicoes", coluna: "chave_local" };

// Quem começa a analisar vira o responsável; depois disso só ele (ou um admin)
// mexe. Admin editando a análise de outra pessoa continua gravando tudo no
// nome do responsável. Vale pra Novas Ações e pra Sobreposições.
export async function resolverResponsavel(
  supabase: SupabaseClient,
  userId: string,
  idAcao: string,
  alvo: AlvoResponsavel = ALVO_NOVAS_ACOES
): Promise<Responsavel> {
  const [{ data: perfil }, { data: revisao }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", userId).single(),
    supabase.from(alvo.tabela).select("responsavel_id").eq(alvo.coluna, idAcao).maybeSingle(),
  ]);
  const ehAdmin = !!perfil?.is_admin;
  const atual = revisao?.responsavel_id as string | null | undefined;

  if (!atual) return { ok: true, responsavelId: userId, ehAdmin, editandoPorOutro: false };
  if (atual === userId) return { ok: true, responsavelId: userId, ehAdmin, editandoPorOutro: false };
  if (ehAdmin) return { ok: true, responsavelId: atual, ehAdmin, editandoPorOutro: true };

  const admin = createAdminClient();
  const { data: dono } = await admin.from("profiles").select("nome").eq("id", atual).maybeSingle();
  return {
    ok: false,
    status: 403,
    error: `Essa análise está com ${dono?.nome ?? "outra pessoa"}. Só ela ou um administrador pode alterar.`,
  };
}

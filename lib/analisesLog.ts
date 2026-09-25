import type { SupabaseClient } from "@supabase/supabase-js";

export type ModuloAnalise = "novas_acoes" | "sobreposicoes" | "termos" | "unidade_quantidade" | "vinculacao";

// Registra no histórico (analises_log) quem fez a análise — base do
// dashboard de produtividade. Nunca pode derrubar a ação principal: se
// falhar (ex.: migration ainda não rodada), só loga o erro.
export async function registrarAnalise(
  client: SupabaseClient,
  usuarioId: string,
  modulo: ModuloAnalise,
  referencia: string,
  acao: string,
  detalhe?: string | null
): Promise<void> {
  try {
    const { error } = await client
      .from("analises_log")
      .insert({ usuario_id: usuarioId, modulo, referencia, acao, detalhe: detalhe ?? null });
    if (error) console.error("analises_log:", error.message);
  } catch (e) {
    console.error("analises_log:", e instanceof Error ? e.message : e);
  }
}

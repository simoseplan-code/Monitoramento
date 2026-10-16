import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALVO_EXECUCAO, CAMPOS_EXECUCAO } from "@/lib/execucao";
import { resolverResponsavel } from "@/lib/responsavelAnalise";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";

// Conclui (ou reabre) a análise de uma ação de "Novas em Execução". Só conclui com todos
// os itens confirmados.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as { idAcao?: unknown; concluido?: unknown } | null;
  const idAcao = typeof corpo?.idAcao === "string" ? corpo.idAcao : "";
  const concluido = corpo?.concluido;
  if (!/^\d{1,12}$/.test(idAcao) || typeof concluido !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const resp = await resolverResponsavel(supabase, user.id, idAcao, ALVO_EXECUCAO);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  if (concluido) {
    const { data: revisao } = await supabase.from("obras_exec_revisao").select("itens").eq("id_acao", idAcao).maybeSingle();
    const itens = (revisao?.itens ?? {}) as Record<string, string>;
    if (!CAMPOS_EXECUCAO.every((c) => itens[c] === "confirmado")) {
      return NextResponse.json({ error: `Confirme os ${CAMPOS_EXECUCAO.length} itens antes de concluir.` }, { status: 400 });
    }
  }

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("obras_exec_revisao")
    .update({
      concluido,
      concluido_em: concluido ? agora : null,
      concluido_por: concluido ? resp.responsavelId : null,
      responsavel_id: resp.responsavelId,
      atualizado_em: agora,
    })
    .eq("id_acao", idAcao)
    .select("id_acao");
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  await registrarAnalise(resp.editandoPorOutro ? createAdminClient() : supabase, resp.responsavelId, "novas_em_execucao", idAcao, concluido ? "concluido" : "reaberto");
  return NextResponse.json({ ok: true });
}

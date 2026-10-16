import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALVO_EXECUCAO, CAMPOS_EXECUCAO, STATUS_ITEM, type StatusItem } from "@/lib/execucao";
import { resolverResponsavel } from "@/lib/responsavelAnalise";
import { limparTexto } from "@/lib/seguranca";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";

// Marca um item da análise de "Novas em Execução" (confirmado / aguardando atualização /
// pendente) e, nos pendentes, guarda o comentário do que aconteceu.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as { idAcao?: unknown; campo?: unknown; status?: unknown; comentario?: unknown } | null;
  const idAcao = typeof corpo?.idAcao === "string" ? corpo.idAcao : "";
  const campo = typeof corpo?.campo === "string" ? corpo.campo : "";
  const status = corpo?.status as StatusItem;
  if (!/^\d{1,12}$/.test(idAcao) || !CAMPOS_EXECUCAO.includes(campo) || !STATUS_ITEM.includes(status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const resp = await resolverResponsavel(supabase, user.id, idAcao, ALVO_EXECUCAO);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  const { data: atual } = await supabase.from("obras_exec_revisao").select("itens, obs, concluido").eq("id_acao", idAcao).maybeSingle();
  const itens = { ...((atual?.itens ?? {}) as Record<string, string>) };
  const obs = { ...((atual?.obs ?? {}) as Record<string, string>) };

  const eraPendente = itens[campo] === "aguardando_atualizacao";
  itens[campo] = status;
  // Comentário só existe enquanto o item está pendente; sem texto novo, mantém o anterior.
  if (status !== "aguardando_atualizacao") delete obs[campo];
  else if (corpo?.comentario !== undefined) {
    const texto = limparTexto(corpo.comentario, 300);
    if (texto) obs[campo] = texto;
    else delete obs[campo];
  } else if (!eraPendente) delete obs[campo];

  const todosConfirmados = CAMPOS_EXECUCAO.every((c) => itens[c] === "confirmado");

  const { error } = await supabase.from("obras_exec_revisao").upsert(
    {
      id_acao: idAcao,
      itens,
      obs,
      responsavel_id: resp.responsavelId,
      revisado_por: resp.responsavelId,
      // Se um item deixa de estar confirmado, a análise não está mais concluída.
      ...(todosConfirmados || !atual?.concluido ? {} : { concluido: false, concluido_em: null, concluido_por: null }),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id_acao" }
  );
  if (error) return NextResponse.json({ error: "Falha ao salvar a análise." }, { status: 500 });

  // Histórico de desempenho: edição de admin na análise de outra pessoa entra no nome do responsável
  // (a regra do log só deixa gravar em nome próprio, então vai pelo servidor).
  await registrarAnalise(resp.editandoPorOutro ? createAdminClient() : supabase, resp.responsavelId, "novas_em_execucao", idAcao, status, campo);

  return NextResponse.json({ ok: true, responsavelId: resp.responsavelId, comentario: obs[campo] ?? null, completo: todosConfirmados });
}

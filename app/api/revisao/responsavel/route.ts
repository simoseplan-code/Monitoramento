import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Só administrador troca quem é o responsável pela análise de uma ação.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: solicitante } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!solicitante?.is_admin || solicitante.status !== "aprovado") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { idAcao, usuarioId, modulo } = (await request.json()) as { idAcao?: string; usuarioId?: string; modulo?: string };
  if (!idAcao || !usuarioId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const admin = createAdminClient();
  const { data: novo } = await admin.from("profiles").select("id, nome, status").eq("id", usuarioId).maybeSingle();
  if (!novo || novo.status !== "aprovado") {
    return NextResponse.json({ error: "Pessoa não encontrada ou sem acesso aprovado." }, { status: 400 });
  }

  const agoraIso = new Date().toISOString();
  if (modulo === "sobreposicoes") {
    // idAcao aqui é a chave do local. Se já houve decisão, a revisão passa a constar no novo responsável.
    const { data: local } = await admin.from("sobreposicoes").select("status").eq("chave_local", idAcao).maybeSingle();
    if (!local) return NextResponse.json({ error: "Local não encontrado." }, { status: 404 });
    const mudancas: Record<string, unknown> = { responsavel_id: novo.id, atualizado_em: agoraIso };
    if (local.status !== "pendente") mudancas.revisado_por = novo.id;
    const { error: erroSobre } = await admin.from("sobreposicoes").update(mudancas).eq("chave_local", idAcao);
    if (erroSobre) return NextResponse.json({ error: "Falha ao trocar o responsável." }, { status: 500 });
    return NextResponse.json({ ok: true, responsavelId: novo.id, responsavelNome: novo.nome });
  }

  // Existe a linha de revisão? Se não, cria vazia já com o responsável.
  const { data: existente } = await admin.from("obras_revisao").select("id_acao, kml_anexado").eq("id_acao", idAcao).maybeSingle();
  const agora = new Date().toISOString();
  const { error } = existente
    ? await admin
        .from("obras_revisao")
        .update({ responsavel_id: novo.id, revisado_por: novo.id, atualizado_em: agora })
        .eq("id_acao", idAcao)
    : await admin.from("obras_revisao").insert({ id_acao: idAcao, responsavel_id: novo.id, revisado_por: novo.id });

  if (error) return NextResponse.json({ error: "Falha ao trocar o responsável." }, { status: 500 });
  return NextResponse.json({ ok: true, responsavelId: novo.id, responsavelNome: novo.nome });
}

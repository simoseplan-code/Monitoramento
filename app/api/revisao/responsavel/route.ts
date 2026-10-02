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

  const { idAcao, usuarioId } = (await request.json()) as { idAcao?: string; usuarioId?: string };
  if (!idAcao || !usuarioId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const admin = createAdminClient();
  const { data: novo } = await admin.from("profiles").select("id, nome, status").eq("id", usuarioId).maybeSingle();
  if (!novo || novo.status !== "aprovado") {
    return NextResponse.json({ error: "Pessoa não encontrada ou sem acesso aprovado." }, { status: 400 });
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

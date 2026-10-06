import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";
import { ALVO_SOBREPOSICOES, resolverResponsavel } from "@/lib/responsavelAnalise";

const STATUS_VALIDOS = ["pendente", "ok", "problema"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Sobreposições é só para admin e chefe (a equipe fica de fora por enquanto).
  const { data: perfilAcesso } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!perfilAcesso?.is_admin) return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const { chaveLocal, status, observacao } = (await request.json()) as {
    chaveLocal?: string;
    status?: string;
    observacao?: string;
  };

  if (!chaveLocal || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const resp = await resolverResponsavel(supabase, user.id, chaveLocal, ALVO_SOBREPOSICOES);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  const { data: salvo, error } = await supabase
    .from("sobreposicoes")
    .update({
      status,
      observacao: observacao?.trim() || null,
      responsavel_id: resp.responsavelId,
      revisado_por: status === "pendente" ? null : resp.responsavelId,
      revisado_em: status === "pendente" ? null : new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("chave_local", chaveLocal)
    .select("chave_local");

  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  // RLS bloqueando não dá erro, só não grava nada.
  if (!salvo || salvo.length === 0) return NextResponse.json({ error: "Sem permissão para alterar esta análise." }, { status: 403 });
  await registrarAnalise(
    resp.editandoPorOutro ? createAdminClient() : supabase,
    resp.responsavelId,
    "sobreposicoes",
    chaveLocal,
    status as string
  );
  return NextResponse.json({ ok: true, responsavelId: resp.responsavelId });
}

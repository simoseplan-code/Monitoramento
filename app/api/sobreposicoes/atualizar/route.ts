import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atualizarSobreposicoes, ErroAtualizacao } from "@/lib/sobreposicoes/atualizar";
import { ErroImportacao } from "@/lib/sobreposicoes/importar";

export const runtime = "nodejs";
export const maxDuration = 300;

// Botão "Atualizar sobreposições". Com { simular: true } só mostra o que mudaria, sem gravar
// nada. O que já foi analisado nunca é apagado nem sobrescrito. A mesma lógica roda sozinha
// todo dia (ver app/api/cron/sync-processar).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const corpo = (await request.json().catch(() => ({}))) as { simular?: unknown };

  try {
    const resultado = await atualizarSobreposicoes(createAdminClient(), { simular: corpo.simular === true });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErroAtualizacao || e instanceof ErroImportacao) {
      return NextResponse.json({ error: e.message }, { status: e instanceof ErroAtualizacao ? e.status : 500 });
    }
    console.error("atualizar sobreposicoes:", e);
    return NextResponse.json({ error: "Falha ao atualizar as sobreposições. Nada do que já foi analisado foi apagado." }, { status: 500 });
  }
}

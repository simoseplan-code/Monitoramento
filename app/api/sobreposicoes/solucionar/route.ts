import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";

// Qualquer pessoa aprovada pode marcar um local "com problema" como
// solucionado (fica gravado quem foi) e também desfazer. O responsável pela
// análise original (responsavel_id) nunca é alterado aqui — por isso a
// gravação vai por service_role, já que a RLS de update trava no responsável.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { chaveLocal, acao } = (await request.json()) as { chaveLocal?: string; acao?: string };
  if (!chaveLocal || (acao !== "solucionar" && acao !== "voltar")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  if (acao === "solucionar") {
    const { data, error } = await admin
      .from("sobreposicoes")
      .update({ status: "solucionado", solucionado_por: user.id, solucionado_em: agora, atualizado_em: agora })
      .eq("chave_local", chaveLocal)
      .eq("status", "problema")
      .select("chave_local");
    if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Esse local não está mais como \"com problema\" (alguém pode ter alterado)." }, { status: 409 });
    }
    await registrarAnalise(admin, user.id, "sobreposicoes", chaveLocal, "solucionado");
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await admin
    .from("sobreposicoes")
    .update({ status: "problema", solucionado_por: null, solucionado_em: null, atualizado_em: agora })
    .eq("chave_local", chaveLocal)
    .eq("status", "solucionado")
    .select("chave_local");
  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Esse local não está mais como solucionado." }, { status: 409 });
  }
  await registrarAnalise(admin, user.id, "sobreposicoes", chaveLocal, "reaberto", "voltou com problema");
  return NextResponse.json({ ok: true });
}

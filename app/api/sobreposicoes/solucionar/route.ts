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

  // Sobreposições é só para admin e chefe (a equipe fica de fora por enquanto).
  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
  if (perfil?.status !== "aprovado" || !perfil.is_admin) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { chaveLocal, acao, solucao } = (await request.json()) as { chaveLocal?: string; acao?: string; solucao?: string };
  if (!chaveLocal || (acao !== "solucionar" && acao !== "voltar")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const textoSolucao = typeof solucao === "string" ? solucao.trim().slice(0, 1000) : "";
  if (acao === "solucionar" && textoSolucao.length < 3) {
    return NextResponse.json({ error: "Informe como o problema foi solucionado." }, { status: 400 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  if (acao === "solucionar") {
    const { data, error } = await admin
      .from("sobreposicoes")
      .update({ status: "solucionado", solucionado_por: user.id, solucionado_em: agora, solucao: textoSolucao, atualizado_em: agora })
      .eq("chave_local", chaveLocal)
      .eq("status", "problema")
      .select("chave_local");
    if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Esse local não está mais como \"com problema\" (alguém pode ter alterado)." }, { status: 409 });
    }
    await registrarAnalise(admin, user.id, "sobreposicoes", chaveLocal, "solucionado", textoSolucao);
    return NextResponse.json({ ok: true });
  }

  const { data: anterior } = await admin.from("sobreposicoes").select("solucao").eq("chave_local", chaveLocal).maybeSingle();

  const { data, error } = await admin
    .from("sobreposicoes")
    .update({ status: "problema", solucionado_por: null, solucionado_em: null, solucao: null, atualizado_em: agora })
    .eq("chave_local", chaveLocal)
    .eq("status", "solucionado")
    .select("chave_local");
  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Esse local não está mais como solucionado." }, { status: 409 });
  }
  await registrarAnalise(admin, user.id, "sobreposicoes", chaveLocal, "reaberto", "voltou com problema" + (anterior?.solucao ? " (solução anterior: " + anterior.solucao + ")" : ""));
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Ignorar / restaurar uma ação na "Nova análise em teste" (tabela auditoria_ignoradas). Qualquer pessoa aprovada da equipe.
async function quem() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { data: perfil } = await supabase.from("profiles").select("nome, status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return { erro: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { user, nome: (perfil.nome as string | null) ?? null };
}

export async function POST(request: NextRequest) {
  const q = await quem();
  if ("erro" in q) return q.erro;
  const corpo = (await request.json().catch(() => null)) as { id?: unknown; motivo?: unknown } | null;
  const id = typeof corpo?.id === "string" ? corpo.id : "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const motivo = typeof corpo?.motivo === "string" && corpo.motivo.trim() ? corpo.motivo.trim().slice(0, 300) : null;
  const agora = new Date().toISOString();
  const { error } = await createAdminClient().from("auditoria_ignoradas").upsert({ id_acao: id, motivo, ignorado_por: q.user.id, ignorado_em: agora }, { onConflict: "id_acao" });
  if (error) return NextResponse.json({ error: "Não foi possível ignorar a ação: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true, por: q.nome, em: agora, motivo });
}

export async function DELETE(request: NextRequest) {
  const q = await quem();
  if ("erro" in q) return q.erro;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const { error } = await createAdminClient().from("auditoria_ignoradas").delete().eq("id_acao", id);
  if (error) return NextResponse.json({ error: "Não foi possível restaurar a ação: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Filtro gravado por pessoa e tela (tabela filtros_salvos). Cada pessoa só mexe no próprio,
// EXCETO nas telas "compartilhadas": ali o filtro gravado é um só e vale para todos (quem grava troca o de todo mundo).
const TELAS = ["analise_concluidas", "acoes", "acoes_nao_vinculadas"];
// Valor = quem pode gravar/apagar: "admin" (admin e chefe) ou "equipe" (toda a equipe aprovada).
const COMPARTILHADAS: Record<string, "admin" | "equipe"> = { analise_concluidas: "admin", acoes_nao_vinculadas: "equipe" };

async function podeMexer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, tela: string): Promise<boolean> {
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", userId).single();
  if (perfil?.status !== "aprovado") return false;
  return COMPARTILHADAS[tela] === "equipe" || !!perfil?.is_admin;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as { tela?: unknown; estado?: unknown } | null;
  const tela = typeof corpo?.tela === "string" ? corpo.tela : "";
  if (!TELAS.includes(tela) || typeof corpo?.estado !== "object" || corpo.estado === null) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (JSON.stringify(corpo.estado).length > 200_000) return NextResponse.json({ error: "Filtro grande demais." }, { status: 413 });

  const agora = new Date().toISOString();

  if (tela in COMPARTILHADAS) {
    // Filtro único e para todos; o servidor confere quem pode gravar.
    if (!(await podeMexer(supabase, user.id, tela))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const admin = createAdminClient();
    const { error: e1 } = await admin.from("filtros_salvos").delete().eq("tela", tela);
    if (e1) return NextResponse.json({ error: "Não foi possível gravar o filtro: " + e1.message }, { status: 500 });
    const { error: e2 } = await admin.from("filtros_salvos").insert({ usuario_id: user.id, tela, estado: corpo.estado, atualizado_em: agora });
    if (e2) return NextResponse.json({ error: "Não foi possível gravar o filtro: " + e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, atualizadoEm: agora });
  }

  const { error } = await supabase
    .from("filtros_salvos")
    .upsert({ usuario_id: user.id, tela, estado: corpo.estado, atualizado_em: agora }, { onConflict: "usuario_id,tela" });
  if (error) {
    console.error("filtros:", error.message);
    return NextResponse.json({ error: "Não foi possível gravar o filtro. Rode o SQL 0079 se ainda não rodou." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, atualizadoEm: agora });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const tela = request.nextUrl.searchParams.get("tela") ?? "";
  if (!TELAS.includes(tela)) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  if (tela in COMPARTILHADAS) {
    if (!(await podeMexer(supabase, user.id, tela))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const { error: e } = await createAdminClient().from("filtros_salvos").delete().eq("tela", tela);
    if (e) return NextResponse.json({ error: "Não foi possível apagar o filtro gravado." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.from("filtros_salvos").delete().eq("usuario_id", user.id).eq("tela", tela);
  if (error) return NextResponse.json({ error: "Não foi possível apagar o filtro gravado." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

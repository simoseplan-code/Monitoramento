import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, aprovado } = (await request.json()) as { idAcao?: string; aprovado?: boolean };
  if (!idAcao || typeof aprovado !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const { error } = await supabase
    .from("obras_unidade_sugestao")
    .update({
      aprovado,
      aprovado_por: aprovado ? user.id : null,
      aprovado_em: aprovado ? new Date().toISOString() : null,
    })
    .eq("id_acao", idAcao);

  if (error) return NextResponse.json({ error: "Falha ao salvar aprovação." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

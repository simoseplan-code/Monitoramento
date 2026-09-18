import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, concluido } = (await request.json()) as { idAcao?: string; concluido?: boolean };
  if (!idAcao || typeof concluido !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  if (concluido) {
    const { data: revisao } = await supabase
      .from("obras_revisao")
      .select("kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios")
      .eq("id_acao", idAcao)
      .maybeSingle();

    const tudoConfirmado =
      revisao?.kml_anexado === "confirmado" &&
      revisao?.sem_duplicacao === "confirmado" &&
      revisao?.trecho_unico === "confirmado" &&
      revisao?.documentos_obrigatorios === "confirmado";

    if (!tudoConfirmado) {
      return NextResponse.json({ error: "Confirme os 4 itens do checklist antes de concluir." }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("obras_revisao")
    .update({
      concluido,
      concluido_em: concluido ? new Date().toISOString() : null,
      concluido_por: concluido ? user.id : null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id_acao", idAcao);

  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

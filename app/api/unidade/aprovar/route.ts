import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UNIDADES_VALIDAS } from "@/lib/unidadeQuantidade/sugestao";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, aprovado, unidadeFinal, quantidadeFinal } = (await request.json()) as {
    idAcao?: string;
    aprovado?: boolean;
    unidadeFinal?: string;
    quantidadeFinal?: string | null;
  };
  if (!idAcao || typeof aprovado !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (aprovado && !UNIDADES_VALIDAS.includes((unidadeFinal ?? "").trim())) {
    return NextResponse.json({ error: `Unidade precisa ser uma das opções válidas do SIMO (${UNIDADES_VALIDAS.join(", ")}).` }, { status: 400 });
  }

  const { error } = await supabase
    .from("obras_unidade_sugestao")
    .update({
      // Guarda o valor editado mesmo ao desfazer aprovação, pra equipe
      // não perder o ajuste que já tinha feito se aprovar de novo depois.
      unidade_final: unidadeFinal ?? null,
      quantidade_final: quantidadeFinal || null,
      aprovado,
      aprovado_por: aprovado ? user.id : null,
      aprovado_em: aprovado ? new Date().toISOString() : null,
    })
    .eq("id_acao", idAcao);

  if (error) return NextResponse.json({ error: "Falha ao salvar aprovação." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

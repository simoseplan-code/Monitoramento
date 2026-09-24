import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UNIDADES_VALIDAS } from "@/lib/unidadeQuantidade/sugestao";
import { paraNumeroBR } from "@/lib/simo/parseCsv";

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

  const quantidade = (quantidadeFinal ?? "").trim();

  if (aprovado) {
    if (!UNIDADES_VALIDAS.includes((unidadeFinal ?? "").trim())) {
      return NextResponse.json({ error: `Unidade precisa ser uma das opções válidas do SIMO (${UNIDADES_VALIDAS.join(", ")}).` }, { status: 400 });
    }
    // Vazio é válido (= manter a Quantidade que já está no SIMO); texto
    // que não é número iria cru pro SIMO, então barra aqui.
    if (quantidade !== "" && paraNumeroBR(quantidade) === null) {
      return NextResponse.json({ error: "Quantidade precisa ser um número (ex.: 9, 25,28 ou 1.732,32)." }, { status: 400 });
    }

    // O SIMO trava edição de ação "Concluído" — aprovar só criaria um
    // erro de "somente leitura" na hora de gravar.
    const { data: obra } = await supabase.from("obras").select("status").eq("id_acao", idAcao).maybeSingle();
    if (/^conclu[ií]do$/i.test((obra?.status ?? "").trim())) {
      return NextResponse.json({ error: "Ação concluída — o SIMO não permite alterar Unidade/Quantidade." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("obras_unidade_sugestao")
    .update({
      // Guarda o valor editado mesmo ao desfazer aprovação, pra equipe
      // não perder o ajuste que já tinha feito se aprovar de novo depois.
      // Quantidade "" é diferente de null: "" = apagou de propósito
      // (mantém a do SIMO); null = nunca editou (vale a sugestão).
      unidade_final: unidadeFinal ?? null,
      quantidade_final: quantidadeFinal === undefined || quantidadeFinal === null ? null : quantidade,
      aprovado,
      aprovado_por: aprovado ? user.id : null,
      aprovado_em: aprovado ? new Date().toISOString() : null,
    })
    .eq("id_acao", idAcao)
    .select("id_acao");

  if (error) return NextResponse.json({ error: "Falha ao salvar aprovação." }, { status: 500 });
  // RLS bloqueando (perfil não aprovado) ou sugestão que saiu da fila num
  // sync: o update "funciona" sem alterar nada — não pode responder ok.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Sugestão não encontrada (pode ter saído da fila no último sync) ou sem permissão." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

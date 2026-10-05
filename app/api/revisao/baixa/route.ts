import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverResponsavel } from "@/lib/responsavelAnalise";

// Dá baixa numa análise pendente de ação que foi excluída do SIMO: não há mais
// o que resolver, então sai da lista de "ações excluídas". Só o responsável
// pela análise ou um admin.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao } = (await request.json()) as { idAcao?: string };
  if (!idAcao) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const resp = await resolverResponsavel(supabase, user.id, idAcao);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  const { data, error } = await supabase
    .from("obras_revisao")
    .update({ baixa_excluida_em: new Date().toISOString(), baixa_excluida_por: user.id, atualizado_em: new Date().toISOString() })
    .eq("id_acao", idAcao)
    .not("excluida_em", "is", null)
    .select("id_acao");

  if (error) return NextResponse.json({ error: "Falha ao dar baixa." }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Ação não encontrada entre as excluídas." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

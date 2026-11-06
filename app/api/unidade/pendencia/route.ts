import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrarAnalise } from "@/lib/analisesLog";

export const runtime = "nodejs";

// "Jogar para pendência" (Unidade / Quantidade): tira a sugestão da fila de revisão, com um comentário, para analisar depois.
// Ela fica na aba "Pendências" até alguém devolver para a análise. Aberto a toda a equipe aprovada.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, pendencia, obs } = (await request.json().catch(() => ({}))) as { idAcao?: string; pendencia?: boolean; obs?: string };
  if (!idAcao || !/^\d{1,12}$/.test(idAcao) || typeof pendencia !== "boolean") return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const comentario = (obs ?? "").trim().slice(0, 1000);
  if (pendencia && !comentario) return NextResponse.json({ error: "Escreva um comentário para jogar para pendência." }, { status: 400 });

  const { data, error } = await supabase
    .from("obras_unidade_sugestao")
    .update(
      pendencia
        ? // Em pendência nada fica aprovado: a decisão é depois.
          { pendencia_em: new Date().toISOString(), pendencia_por: user.id, pendencia_obs: comentario, aprovado: false, aprovado_por: null, aprovado_em: null }
        : { pendencia_em: null, pendencia_por: null, pendencia_obs: null }
    )
    .eq("id_acao", idAcao)
    .is("aplicado_em", null)
    .select("id_acao");

  if (error) {
    const faltaSql = /pendencia/i.test(error.message);
    return NextResponse.json({ error: faltaSql ? "Falta rodar o SQL 0095 no Supabase." : "Falha ao salvar a pendência." }, { status: 500 });
  }
  if (!data || data.length === 0) return NextResponse.json({ error: "Sugestão não encontrada (pode ter saído da fila ou já foi aplicada) ou sem permissão." }, { status: 404 });

  await registrarAnalise(supabase, user.id, "unidade_quantidade", idAcao, pendencia ? "pendencia" : "voltou_da_pendencia", pendencia ? comentario : null);
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrarAnalise } from "@/lib/analisesLog";

const STATUS_VALIDOS = ["pendente", "corrigido", "problema"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, status, observacao } = (await request.json()) as {
    idAcao?: string;
    status?: string;
    observacao?: string;
  };
  if (!idAcao || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("obras_termos_revisao")
    .upsert(
      {
        id_acao: idAcao,
        status,
        observacao: observacao?.trim() || null,
        revisado_por: status === "pendente" ? null : user.id,
        revisado_em: status === "pendente" ? null : agora,
        atualizado_em: agora,
      },
      { onConflict: "id_acao" }
    )
    .select("id_acao");

  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  // RLS bloqueando (perfil não aprovado) não dá erro, só não grava nada.
  if (!data || data.length === 0) return NextResponse.json({ error: "Sem permissão para salvar." }, { status: 403 });
  await registrarAnalise(supabase, user.id, "termos", idAcao, status as string);
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_VALIDOS = ["pendente", "ok", "problema"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { chaveLocal, status, observacao } = (await request.json()) as {
    chaveLocal?: string;
    status?: string;
    observacao?: string;
  };

  if (!chaveLocal || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const { error } = await supabase
    .from("sobreposicoes")
    .update({
      status,
      observacao: observacao?.trim() || null,
      revisado_por: status === "pendente" ? null : user.id,
      revisado_em: status === "pendente" ? null : new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("chave_local", chaveLocal);

  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

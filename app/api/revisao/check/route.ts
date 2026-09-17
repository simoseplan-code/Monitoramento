import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CAMPOS_VALIDOS = ["kml_anexado", "sem_duplicacao", "trecho_unico", "documentos_obrigatorios"] as const;
type Campo = (typeof CAMPOS_VALIDOS)[number];

const STATUS_VALIDOS = ["pendente", "confirmado", "aguardando_atualizacao"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, campo, status } = (await request.json()) as { idAcao?: string; campo?: string; status?: string };

  if (!idAcao || !CAMPOS_VALIDOS.includes(campo as Campo) || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const { data: atual } = await supabase
    .from("obras_revisao")
    .select("kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios")
    .eq("id_acao", idAcao)
    .maybeSingle();

  const proximo = {
    kml_anexado: atual?.kml_anexado ?? "pendente",
    sem_duplicacao: atual?.sem_duplicacao ?? "pendente",
    trecho_unico: atual?.trecho_unico ?? "pendente",
    documentos_obrigatorios: atual?.documentos_obrigatorios ?? "pendente",
    [campo as Campo]: status,
  };

  const completo = Object.values(proximo).every((v) => v === "confirmado");

  const { error } = await supabase.from("obras_revisao").upsert(
    {
      id_acao: idAcao,
      ...proximo,
      revisado_por: user.id,
      revisado_em: completo ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id_acao" }
  );

  if (error) return NextResponse.json({ error: "Falha ao salvar checklist." }, { status: 500 });

  return NextResponse.json({ ok: true, completo });
}

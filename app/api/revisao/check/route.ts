import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CAMPOS_VALIDOS = ["kml_anexado", "sem_duplicacao", "trecho_unico", "documentos_obrigatorios"] as const;
type Campo = (typeof CAMPOS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, campo, valor } = (await request.json()) as { idAcao?: string; campo?: string; valor?: boolean };

  if (!idAcao || !CAMPOS_VALIDOS.includes(campo as Campo) || typeof valor !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const { data: atual } = await supabase
    .from("obras_revisao")
    .select("kml_anexado, sem_duplicacao, trecho_unico, documentos_obrigatorios")
    .eq("id_acao", idAcao)
    .maybeSingle();

  const proximo = {
    kml_anexado: atual?.kml_anexado ?? false,
    sem_duplicacao: atual?.sem_duplicacao ?? false,
    trecho_unico: atual?.trecho_unico ?? false,
    documentos_obrigatorios: atual?.documentos_obrigatorios ?? false,
    [campo as Campo]: valor,
  };

  const completo = proximo.kml_anexado && proximo.sem_duplicacao && proximo.trecho_unico && proximo.documentos_obrigatorios;

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

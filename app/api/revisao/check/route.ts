import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";
import { resolverResponsavel } from "@/lib/responsavelAnalise";
import { limparTexto } from "@/lib/seguranca";

const CAMPOS_VALIDOS = ["kml_anexado", "sem_duplicacao", "documentos_obrigatorios"] as const;
type Campo = (typeof CAMPOS_VALIDOS)[number];

const STATUS_VALIDOS = ["pendente", "confirmado", "aguardando_atualizacao"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { idAcao, campo, status, comentario } = (await request.json()) as { idAcao?: string; campo?: string; status?: string; comentario?: unknown };

  if (!idAcao || !CAMPOS_VALIDOS.includes(campo as Campo) || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const resp = await resolverResponsavel(supabase, user.id, idAcao);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  const { data: atual } = await supabase
    .from("obras_revisao")
    .select("kml_anexado, sem_duplicacao, documentos_obrigatorios, kml_obs, duplicacao_obs, documentos_obs")
    .eq("id_acao", idAcao)
    .maybeSingle();

  const proximo = {
    kml_anexado: atual?.kml_anexado ?? "pendente",
    sem_duplicacao: atual?.sem_duplicacao ?? "pendente",
    documentos_obrigatorios: atual?.documentos_obrigatorios ?? "pendente",
    [campo as Campo]: status,
  };

  const completo = Object.values(proximo).every((v) => v === "confirmado");

  // Comentário do item (o que aconteceu): só existe enquanto o item está pendente.
  // Sem comentário novo, mantém o que já estava; saindo de pendente, apaga.
  const colunaObs = ({ kml_anexado: "kml_obs", sem_duplicacao: "duplicacao_obs", documentos_obrigatorios: "documentos_obs" } as const)[campo as Campo];
  const obsAtual = (atual as Record<string, string | null> | null)?.[colunaObs] ?? null;
  const obsNovo =
    status !== "aguardando_atualizacao"
      ? null
      : comentario !== undefined
        ? limparTexto(comentario, 300)
        : atual?.[campo as Campo] === "aguardando_atualizacao"
          ? obsAtual
          : null;

  const { error } = await supabase.from("obras_revisao").upsert(
    {
      id_acao: idAcao,
      ...proximo,
      [colunaObs]: obsNovo,
      responsavel_id: resp.responsavelId,
      revisado_por: resp.responsavelId,
      revisado_em: completo ? new Date().toISOString() : null,
      // Se um item deixa de estar confirmado, a análise não está mais concluída.
      ...(completo ? {} : { concluido: false, concluido_em: null, concluido_por: null }),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id_acao" }
  );

  if (error) return NextResponse.json({ error: "Falha ao salvar checklist." }, { status: 500 });

  // Edição de admin na ação de outra pessoa entra no nome do responsável
  // (a policy do log só deixa gravar em nome próprio, então vai por service_role).
  await registrarAnalise(
    resp.editandoPorOutro ? createAdminClient() : supabase,
    resp.responsavelId,
    "novas_acoes",
    idAcao,
    status as string,
    campo as string
  );
  return NextResponse.json({ ok: true, completo, responsavelId: resp.responsavelId, comentario: obsNovo });
}

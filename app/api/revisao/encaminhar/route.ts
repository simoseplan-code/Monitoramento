import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Motivo = { id: string; motivo: string };

// Encaminha (em grupo) ações com item pendente para "Aguardando solução de
// pendência", ou devolve elas para a fila de análise. Só o responsável pela
// análise ou um administrador mexe em cada ação — o resto vem na lista de ignoradas.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { ids, acao } = (await request.json()) as { ids?: string[]; acao?: string };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || (acao !== "encaminhar" && acao !== "voltar")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const unicos = Array.from(new Set(ids.filter((i) => typeof i === "string" && i)));

  const [{ data: perfil }, { data: linhas, error: erroLeitura }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    supabase
      .from("obras_revisao")
      .select("id_acao, responsavel_id, kml_anexado, sem_duplicacao, documentos_obrigatorios, concluido, encaminhada_em")
      .in("id_acao", unicos),
  ]);
  if (erroLeitura) return NextResponse.json({ error: "Falha ao ler as ações." }, { status: 500 });
  const ehAdmin = !!perfil?.is_admin;

  const porId = new Map((linhas ?? []).map((l) => [l.id_acao as string, l]));
  const liberadas: string[] = [];
  const ignoradas: Motivo[] = [];

  for (const id of unicos) {
    const l = porId.get(id);
    if (!l) {
      ignoradas.push({ id, motivo: "ação sem análise registrada" });
      continue;
    }
    if (!ehAdmin && l.responsavel_id !== user.id) {
      ignoradas.push({ id, motivo: "análise está com outra pessoa" });
      continue;
    }
    if (acao === "encaminhar") {
      const temPendencia = [l.kml_anexado, l.sem_duplicacao, l.documentos_obrigatorios].includes("aguardando_atualizacao");
      if (l.concluido) ignoradas.push({ id, motivo: "análise já concluída" });
      else if (!temPendencia) ignoradas.push({ id, motivo: "nenhum item marcado como pendente" });
      else if (l.encaminhada_em) ignoradas.push({ id, motivo: "já estava encaminhada" });
      else liberadas.push(id);
    } else if (!l.encaminhada_em) {
      ignoradas.push({ id, motivo: "não estava encaminhada" });
    } else {
      liberadas.push(id);
    }
  }

  if (liberadas.length > 0) {
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("obras_revisao")
      .update(
        acao === "encaminhar"
          ? { encaminhada_em: agora, encaminhada_por: user.id, atualizado_em: agora }
          : { encaminhada_em: null, encaminhada_por: null, atualizado_em: agora }
      )
      .in("id_acao", liberadas);
    if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, feitas: liberadas.length, ignoradas });
}

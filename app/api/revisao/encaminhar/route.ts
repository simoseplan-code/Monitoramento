import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";

type Motivo = { id: string; motivo: string };
type Acao = "encaminhar" | "voltar" | "resolver";

// Encaminha (em grupo) ações com item pendente para "Aguardando solução de
// pendência", devolve elas para a fila de análise, ou registra que o órgão
// RESOLVEU a pendência (confirma os itens pendentes e conclui a análise). Só o
// responsável pela análise ou um administrador mexe em cada ação — o resto vem
// na lista de ignoradas.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { ids, acao } = (await request.json()) as { ids?: string[]; acao?: Acao };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !["encaminhar", "voltar", "resolver"].includes(acao ?? "")) {
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
    } else if (acao === "resolver" && l.concluido) {
      ignoradas.push({ id, motivo: "análise já concluída" });
    } else {
      liberadas.push(id);
    }
  }

  const agora = new Date().toISOString();

  if (acao === "resolver") {
    let concluidas = 0;
    let devolvidas = 0;
    const comFalha: Motivo[] = [];

    for (const id of liberadas) {
      const l = porId.get(id)!;
      // Os itens marcados como pendentes passam a confirmados.
      const confirma = (v: string) => (v === "aguardando_atualizacao" ? "confirmado" : v);
      const novo = {
        kml_anexado: confirma(l.kml_anexado),
        sem_duplicacao: confirma(l.sem_duplicacao),
        documentos_obrigatorios: confirma(l.documentos_obrigatorios),
      };
      const tudoConfirmado = Object.values(novo).every((v) => v === "confirmado");
      const responsavelId = (l.responsavel_id as string | null) ?? user.id;

      const { error } = await supabase
        .from("obras_revisao")
        .update(
          tudoConfirmado
            ? {
                ...novo,
                concluido: true,
                concluido_em: agora,
                concluido_por: responsavelId,
                responsavel_id: responsavelId,
                encaminhada_em: null,
                encaminhada_por: null,
                pendencia_resolvida_em: agora,
                pendencia_resolvida_por: user.id,
                atualizado_em: agora,
              }
            : // Sobrou item que nunca foi analisado: não dá pra concluir; volta pra fila já com o resolvido confirmado.
              { ...novo, encaminhada_em: null, encaminhada_por: null, pendencia_resolvida_em: agora, pendencia_resolvida_por: user.id, atualizado_em: agora }
        )
        .eq("id_acao", id);
      if (error) {
        comFalha.push({ id, motivo: "falha ao salvar" });
        continue;
      }
      if (tudoConfirmado) {
        concluidas++;
        // Conclusão entra no nome do responsável (a policy do log só deixa gravar em nome próprio).
        await registrarAnalise(
          responsavelId === user.id ? supabase : createAdminClient(),
          responsavelId,
          "novas_acoes",
          id,
          "concluido",
          "pendência resolvida pelo órgão"
        );
      } else {
        devolvidas++;
      }
    }
    return NextResponse.json({ ok: true, feitas: concluidas + devolvidas, concluidas, devolvidas, ignoradas: [...ignoradas, ...comFalha] });
  }

  if (liberadas.length > 0) {
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

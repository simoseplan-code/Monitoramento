import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { limparTexto } from "@/lib/seguranca";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";
import { ALVO_SOBREPOSICOES, resolverResponsavel } from "@/lib/responsavelAnalise";
import { chavesDoPar, reconstruirPar } from "@/lib/sobreposicoes/par";

const STATUS_VALIDOS = ["pendente", "ok", "problema"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Sobreposições é só para admin e chefe (a equipe fica de fora por enquanto).
  const { data: perfilAcesso } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!perfilAcesso?.is_admin) return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const { chaveLocal, status, observacao, destino } = (await request.json()) as {
    chaveLocal?: string;
    status?: string;
    observacao?: string;
    destino?: string;
  };

  if (!chaveLocal || !STATUS_VALIDOS.includes(status as Status)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const resp = await resolverResponsavel(supabase, user.id, chaveLocal, ALVO_SOBREPOSICOES);
  if (!resp.ok) return NextResponse.json({ error: resp.error }, { status: resp.status });

  const campos = {
    status,
    // Par com problema: vai para a aba Pendências (padrão) ou para a aba CGFR. Nos outros status volta ao padrão.
    destino: status === "problema" && destino === "cgfr" ? "cgfr" : "pendencias",
    observacao: limparTexto(observacao, 2000),
    responsavel_id: resp.responsavelId,
    revisado_por: status === "pendente" ? null : resp.responsavelId,
    revisado_em: status === "pendente" ? null : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    // Reabrir/decidir de novo apaga uma solução anterior.
    ...(status === "pendente" ? { solucionado_por: null, solucionado_em: null, solucao: null } : {}),
  };
  const { data: salvo, error } = await supabase.from("sobreposicoes").update(campos).eq("chave_local", chaveLocal).select("chave_local");

  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  // RLS bloqueando não dá erro, só não grava nada.
  if (!salvo || salvo.length === 0) return NextResponse.json({ error: "Sem permissão para alterar esta análise." }, { status: 403 });

  // A análise vale para o par de obras inteiro: os outros trechos do mesmo par recebem a mesma decisão.
  const adminPar = createAdminClient();
  const irmas = (await chavesDoPar(adminPar, chaveLocal)).filter((c) => c !== chaveLocal);
  if (irmas.length > 0) {
    const { error: erroIrmas } = await adminPar.from("sobreposicoes").update(campos).in("chave_local", irmas);
    if (erroIrmas) return NextResponse.json({ error: "Salvou o trecho principal, mas falhou ao aplicar nos outros trechos do par. Tente de novo." }, { status: 500 });
  }
  await reconstruirPar(adminPar, chaveLocal);
  await registrarAnalise(
    resp.editandoPorOutro ? createAdminClient() : supabase,
    resp.responsavelId,
    "sobreposicoes",
    chaveLocal,
    status as string
  );
  return NextResponse.json({ ok: true, responsavelId: resp.responsavelId });
}

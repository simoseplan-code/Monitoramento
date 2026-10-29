import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAnalise } from "@/lib/analisesLog";

type Acao = "adicionar_mae" | "adicionar_filha" | "remover_mae" | "remover_filha";
const ACOES: Acao[] = ["adicionar_mae", "adicionar_filha", "remover_mae", "remover_filha"];

// Configuração de TD: monta a hierarquia ação mãe > ações filhas pelo ID da ação.
// Só admin e chefe (as regras de linha das tabelas também barram quem não for).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { acao?: unknown; id?: unknown; idMae?: unknown } | null;
  const acao = corpo?.acao as Acao;
  const id = typeof corpo?.id === "string" ? corpo.id.trim() : "";
  const idMae = typeof corpo?.idMae === "string" ? corpo.idMae.trim() : "";
  if (!ACOES.includes(acao) || !/^\d{1,12}$/.test(id) || (acao === "adicionar_filha" && !/^\d{1,12}$/.test(idMae))) {
    return NextResponse.json({ error: "Informe um ID de ação válido (só números)." }, { status: 400 });
  }

  if (acao === "remover_mae") {
    const { error } = await supabase.from("td_acoes_mae").delete().eq("id_acao", id);
    if (error) return NextResponse.json({ error: "Não foi possível remover." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (acao === "remover_filha") {
    const { error } = await supabase.from("td_acoes_filha").delete().eq("id_acao", id);
    if (error) return NextResponse.json({ error: "Não foi possível remover." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Adicionar: a ação precisa existir na base do SIMO.
  // Lê a base completa: a Configuração de TD não esconde os IDs desconsiderados em "Todas as análises".
  const { data: obra } = await createAdminClient().from("obras").select("id_acao, nome_acao").eq("id_acao", id).maybeSingle();
  if (!obra) return NextResponse.json({ error: `Não encontrei a ação ${id} na base. Confira o ID.` }, { status: 404 });

  if (acao === "adicionar_mae") {
    const { error } = await supabase.from("td_acoes_mae").insert({ id_acao: id, criado_por: user.id });
    if (!error) await registrarAnalise(supabase, user.id, "configuracao_td", id, "adicionar_mae");
    return resultado(error, `A ação ${id} já está na configuração como mãe.`);
  }

  const { data: mae } = await supabase.from("td_acoes_mae").select("id_acao").eq("id_acao", idMae).maybeSingle();
  if (!mae) return NextResponse.json({ error: "A ação mãe não existe mais. Atualize a página." }, { status: 404 });
  const { error } = await supabase.from("td_acoes_filha").insert({ id_acao: id, id_acao_mae: idMae, criado_por: user.id });
  if (!error) await registrarAnalise(supabase, user.id, "configuracao_td", id, "adicionar_filha", `mãe ${idMae}`);
  return resultado(error, `A ação ${id} já é filha de uma ação mãe.`);
}

function resultado(error: { code?: string; message: string } | null, textoDuplicada: string) {
  if (!error) return NextResponse.json({ ok: true });
  if (error.code === "23505") return NextResponse.json({ error: textoDuplicada }, { status: 409 });
  // Mensagens das regras do banco ("já é filha...", "já é uma ação mãe...") são claras para o usuário.
  if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
  console.error("td:", error);
  return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
}

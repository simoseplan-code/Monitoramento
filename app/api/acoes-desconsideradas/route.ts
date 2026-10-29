import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Lista compartilhada de IDs desconsiderados da análise "Ações não vinculadas ao SIAFE".
// Qualquer pessoa aprovada inclui e devolve; o banco também trava (RLS).
const LIMITE_IDS = 5000;

async function listaAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const linhas: { id: string; em: string; por: string | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao, desconsiderada_em, por_nome").order("id_acao").range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) linhas.push({ id: r.id_acao as string, em: r.desconsiderada_em as string, por: (r.por_nome as string | null) ?? null });
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("nome, status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { acao?: string; ids?: unknown } | null;
  const ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.filter((i): i is string => typeof i === "string" && /^\d{1,12}$/.test(i)))) : [];
  const acao = corpo?.acao;

  try {
    if (acao === "adicionar") {
      if (ids.length === 0 || ids.length > LIMITE_IDS) return NextResponse.json({ error: "Informe de 1 a 5.000 IDs." }, { status: 400 });
      const agora = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500).map((id) => ({ id_acao: id, desconsiderada_em: agora, desconsiderada_por: user.id, por_nome: perfil.nome ?? null }));
        // Quem já estava na lista continua como estava (não troca quem pôs).
        const { error } = await supabase.from("acoes_desconsideradas").upsert(lote, { onConflict: "id_acao", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
    } else if (acao === "devolver") {
      if (ids.length === 0 || ids.length > LIMITE_IDS) return NextResponse.json({ error: "Informe de 1 a 5.000 IDs." }, { status: 400 });
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from("acoes_desconsideradas").delete().in("id_acao", ids.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
    } else if (acao === "devolver_todos") {
      const { error } = await supabase.from("acoes_desconsideradas").delete().neq("id_acao", "");
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, lista: await listaAtual(supabase) });
  } catch (e) {
    console.error("acoes-desconsideradas:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não foi possível salvar. Se o SQL 0085 ainda não foi rodado, rode-o primeiro." }, { status: 500 });
  }
}

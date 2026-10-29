import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TELAS_DESCONSIDERADAS, listarDesconsideradas } from "@/lib/desconsideradas";

export const runtime = "nodejs";

// Listas compartilhadas de IDs desconsiderados das análises (uma por análise, mais a "todas").
// Qualquer pessoa aprovada mexe nas listas abertas; "todas" e "obras concluídas" são só de admin e chefe.
const LIMITE_IDS = 5000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("nome, status, is_admin").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { tela?: string; acao?: string; ids?: unknown } | null;
  const definicao = TELAS_DESCONSIDERADAS.find((t) => t.chave === corpo?.tela);
  if (!definicao) return NextResponse.json({ error: "Lista inválida." }, { status: 400 });
  const tela = definicao.chave;
  if (definicao.restrita && !perfil.is_admin) return NextResponse.json({ error: "Só admin e chefe mexem nesta lista." }, { status: 403 });

  const ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.filter((i): i is string => typeof i === "string" && /^\d{1,12}$/.test(i)))) : [];
  const acao = corpo?.acao;

  try {
    if (acao === "adicionar") {
      if (ids.length === 0 || ids.length > LIMITE_IDS) return NextResponse.json({ error: "Informe de 1 a 5.000 IDs." }, { status: 400 });
      const agora = new Date().toISOString();
      // Quem já estava na lista continua como estava (não troca quem pôs): só entram os IDs novos.
      const jaTem = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from("acoes_desconsideradas").select("id_acao").eq("tela", tela).in("id_acao", ids.slice(i, i + 200));
        if (error) throw new Error(`ler a lista: ${error.message}`);
        for (const r of data ?? []) jaTem.add(r.id_acao as string);
      }
      const novos = ids.filter((id) => !jaTem.has(id));
      for (let i = 0; i < novos.length; i += 500) {
        const lote = novos.slice(i, i + 500).map((id) => ({ tela, id_acao: id, desconsiderada_em: agora, desconsiderada_por: user.id, por_nome: perfil.nome ?? null }));
        const { error } = await supabase.from("acoes_desconsideradas").insert(lote);
        if (error) throw new Error(`gravar: ${error.message}`);
      }
    } else if (acao === "devolver") {
      if (ids.length === 0 || ids.length > LIMITE_IDS) return NextResponse.json({ error: "Informe de 1 a 5.000 IDs." }, { status: 400 });
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from("acoes_desconsideradas").delete().eq("tela", tela).in("id_acao", ids.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
    } else if (acao === "devolver_todos") {
      const { error } = await supabase.from("acoes_desconsideradas").delete().eq("tela", tela);
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const lista = (await listarDesconsideradas(supabase, [tela])).map(({ tela: _t, ...resto }) => resto);
    return NextResponse.json({ ok: true, lista });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("acoes-desconsideradas:", msg);
    return NextResponse.json({ error: `Não foi possível salvar: ${msg}` }, { status: 500 });
  }
}

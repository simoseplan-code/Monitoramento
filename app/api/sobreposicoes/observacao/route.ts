import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { limparTexto } from "@/lib/seguranca";
import { chavesDoPar, reconstruirPar } from "@/lib/sobreposicoes/par";

// Acrescenta uma observação ao par de obras (sem apagar as anteriores). Cada linha leva a data e quem escreveu.
// Só admin e chefe (Sobreposições é só deles). Vale para todos os trechos do par.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("nome, status, is_admin").eq("id", user.id).single();
  if (perfil?.status !== "aprovado" || !perfil.is_admin) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const { chaveLocal, texto } = (await request.json().catch(() => ({}))) as { chaveLocal?: string; texto?: string };
  const novo = limparTexto(texto, 1000)?.trim();
  if (!chaveLocal || !novo || novo.length < 2) return NextResponse.json({ error: "Escreva a observação." }, { status: 400 });

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin.from("sobreposicoes").select("observacao").eq("chave_local", chaveLocal).maybeSingle();
  if (erroLeitura || !atual) return NextResponse.json({ error: "Local não encontrado." }, { status: 404 });

  const dia = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  const linha = `[${dia} · ${perfil.nome ?? "Equipe"}] ${novo}`;
  const observacao = [((atual.observacao as string | null) ?? "").trim(), linha].filter(Boolean).join("\n");
  if (observacao.length > 6000) return NextResponse.json({ error: "A observação do par ficou grande demais." }, { status: 400 });

  const chaves = await chavesDoPar(admin, chaveLocal);
  const { error } = await admin.from("sobreposicoes").update({ observacao, atualizado_em: new Date().toISOString() }).in("chave_local", chaves);
  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  await reconstruirPar(admin, chaveLocal);
  return NextResponse.json({ ok: true, observacao });
}

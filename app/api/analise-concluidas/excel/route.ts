import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { carregarDesconsideradas, carregarObrasConcluidas, montarRelatorio } from "@/lib/analiseConcluidasDados";
import { gerarExcelAnalise } from "@/lib/analiseConcluidasExcel";

export const runtime = "nodejs";
export const maxDuration = 60;

// Excel da Análise de obras concluídas, já com os filtros que a tela está usando.
// Só admin e chefe.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("nome, is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { estado?: unknown } | null;
  try {
    const { obras, erro } = await carregarObrasConcluidas(supabase);
    if (erro) return NextResponse.json({ error: "Não consegui ler as obras." }, { status: 500 });
    const relatorio = montarRelatorio(obras, corpo?.estado, await carregarDesconsideradas(supabase));
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
    const buffer = await gerarExcelAnalise(relatorio, perfil.nome ?? "Usuário", agora);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="analise-obras-concluidas-${hoje}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("excel analise concluidas:", e);
    return NextResponse.json({ error: "Falha ao gerar o Excel." }, { status: 500 });
  }
}

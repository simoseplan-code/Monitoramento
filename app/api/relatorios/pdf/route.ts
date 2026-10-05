import { createElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { reunirDadosPdf } from "@/lib/relatorioDados";
import { RelatorioPdf, type TipoPdf } from "@/lib/pdf/RelatorioPdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIPOS: TipoPdf[] = ["completo", "novas_acoes", "sobreposicoes", "termos"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const tipo = request.nextUrl.searchParams.get("tipo") as TipoPdf | null;
  if (!tipo || !TIPOS.includes(tipo)) return NextResponse.json({ error: "Tipo de relatório inválido." }, { status: 400 });

  try {
    // A página de desempenho da equipe só entra para admin.
    const dados = await reunirDadosPdf(supabase, !!perfil.is_admin);
    const buffer = await renderToBuffer(createElement(RelatorioPdf, { dados, tipo }) as Parameters<typeof renderToBuffer>[0]);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${tipo.replace("_", "-")}-${hoje}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar o relatório." }, { status: 500 });
  }
}

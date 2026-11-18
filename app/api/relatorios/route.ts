import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarRelatorio, type TipoRelatorio } from "@/lib/relatorios";
import { buscarParesComProblema, excelParesComProblema } from "@/lib/sobreposicoes/relatorioProblemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIPOS: TipoRelatorio[] = ["completo", "novas_acoes", "sobreposicoes", "termos"];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
  // Relatórios só para administrador.
  if (perfil?.status !== "aprovado" || !perfil.is_admin) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const tipo = request.nextUrl.searchParams.get("tipo") as TipoRelatorio | null;

  // Sobreposições: todos os pares de obras com problema (mesma base da tela).
  if (request.nextUrl.searchParams.get("tipo") === "sobreposicoes_problemas") {
    try {
      const orgaos = (request.nextUrl.searchParams.get("orgao") ?? "").split("|").map((o) => o.trim()).filter(Boolean);
      const destino = request.nextUrl.searchParams.get("destino") === "cgfr" ? "cgfr" : "pendencias";
      const pares = await buscarParesComProblema(supabase, orgaos, destino);
      const buffer = await excelParesComProblema(pares, orgaos, destino);
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sobreposicoes-${destino === "cgfr" ? "cgfr" : "com-problema"}${orgaos.length === 1 ? `-${orgaos[0].replace(/[^A-Za-z0-9]+/g, "_")}` : ""}-${hoje}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      console.error("relatorio sobreposicoes problemas:", e);
      return NextResponse.json({ error: "Falha ao gerar o relatório." }, { status: 500 });
    }
  }

  if (!tipo || !TIPOS.includes(tipo)) return NextResponse.json({ error: "Tipo de relatório inválido." }, { status: 400 });

  try {
    // O histórico de atividades (desempenho por pessoa) só entra pra admin.
    const { buffer, arquivo } = await gerarRelatorio(tipo, { ehAdmin: !!perfil.is_admin });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${arquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("relatorio excel:", e);
    return NextResponse.json({ error: "Falha ao gerar o relatório." }, { status: 500 });
  }
}

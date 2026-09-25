import { NextResponse, type NextRequest } from "next/server";
import { executarSyncBaixar } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// Camada 1 do sync diário (04:00): só baixa o relatório do SIMO e guarda no
// banco. A gravação das obras e a fila de Unidade/Quantidade rodam depois,
// em /api/cron/sync-processar.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { kb } = await executarSyncBaixar();
    return NextResponse.json({ ok: true, kb });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

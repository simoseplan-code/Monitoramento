import { NextResponse, type NextRequest } from "next/server";
import { executarSyncSugestoes } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// Etapa 2 do sync diário (fila de Unidade/Quantidade) — roda alguns
// minutos depois do sync de obras, em requisição própria pra ter o seu
// próprio limite de tempo.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { naFila } = await executarSyncSugestoes();
    return NextResponse.json({ ok: true, naFila });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { executarSyncObras, executarSyncSugestoes } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// Camadas 2 e 3 do sync diário (04:15, depois do download das 04:00): grava
// as obras a partir do relatório guardado e recalcula a fila de
// Unidade/Quantidade. O Hobby da Vercel só permite 2 crons, então as duas
// rodam na mesma requisição; se a gravação já consumiu a maior parte do
// tempo, a fila fica pra o botão "Recalcular sugestões".
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    const { linhas } = await executarSyncObras();
    if (Date.now() - inicio > 35_000) {
      return NextResponse.json({ ok: true, linhas, sugestoes: "adiadas (tempo)" });
    }
    const { naFila } = await executarSyncSugestoes();
    return NextResponse.json({ ok: true, linhas, naFila });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

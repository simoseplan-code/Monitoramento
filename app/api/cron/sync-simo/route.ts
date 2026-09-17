import { NextResponse, type NextRequest } from "next/server";
import { executarSyncSimo } from "@/lib/simo/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { linhas } = await executarSyncSimo();
    return NextResponse.json({ ok: true, linhas });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

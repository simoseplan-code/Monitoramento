import { NextResponse, type NextRequest } from "next/server";
import { executarSyncObras, executarSyncSugestoes } from "@/lib/simo/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { atualizarSobreposicoes } from "@/lib/sobreposicoes/atualizar";

export const runtime = "nodejs";
// 300s: gravar as obras e, no fim, atualizar as Sobreposições (baixa os traçados do mapa e
// detecta, uns 40 a 60 s). As etapas finais só rodam se sobrou tempo.
export const maxDuration = 300;

function autorizado(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// Camadas 2 e 3 do sync diário (04:15, depois do download das 04:00): grava as obras a partir
// do relatório guardado e recalcula a fila de Unidade/Quantidade. Em seguida atualiza as
// Sobreposições direto dos traçados do mapa. O Hobby da Vercel só permite 2 crons, então tudo
// roda na mesma requisição. A atualização das Sobreposições NUNCA apaga nem altera o que já foi
// analisado, e recusa o resultado se ele cair mais da metade em relação ao que já existe.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    const { linhas } = await executarSyncObras();

    let naFila: number | null = null;
    if (Date.now() - inicio <= 35_000) {
      ({ naFila } = await executarSyncSugestoes());
    }

    // Sobreposições: erro aqui não derruba o resto do sync; fica no histórico (sync_log).
    let sobreposicoes: string;
    if (Date.now() - inicio > 150_000) {
      sobreposicoes = "adiada (tempo): use o botão Atualizar sobreposições";
    } else {
      const admin = createAdminClient();
      try {
        const r = await atualizarSobreposicoes(admin, { automatico: true });
        sobreposicoes = `OK: ${r.total} locais (${r.novos} novos, ${r.jaExistiam} já existiam, ${r.analiseReaproveitada} análises passadas para chave nova, ${r.removidos} sem análise removidos, ${r.analisadosMantidos} analisados mantidos; ${r.acoesComTracado} ações do mapa + ${r.acoesDeKml} só com KML guardado).`;
        await admin.from("sync_log").insert({ sucesso: true, linhas_processadas: r.total, mensagem: `Sobreposições (automático, ${r.toleranciaM} m): ${sobreposicoes}` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido.";
        sobreposicoes = `FALHOU: ${msg}`;
        console.error("cron sobreposicoes:", msg);
        await admin.from("sync_log").insert({ sucesso: false, mensagem: `Sobreposições (automático): ${msg} Nada do que já foi analisado foi alterado.` });
      }
    }

    return NextResponse.json({ ok: true, linhas, naFila: naFila ?? "adiadas (tempo)", sobreposicoes });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}

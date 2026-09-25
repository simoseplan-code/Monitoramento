"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type Detalhe = { idAcao: string; nomeAcao: string; unidade: string; quantidade: string; resultado: string };

export function AplicarUnidadeBotao({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{ sucesso: number; falha: number; restantes: number; detalhes: Detalhe[] } | null>(null);

  async function aplicar() {
    setConfirmando(false);
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/aplicar-unidade", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) {
        setErro(data.error);
        setUltimoResultado(null);
      } else {
        setUltimoResultado({ sucesso: data.sucesso, falha: data.falha, restantes: data.restantes, detalhes: data.detalhes ?? [] });
      }
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      {pendentes === 0 && !ultimoResultado && !erro ? (
        <span className="text-xs text-ink-muted">Nenhuma sugestão aprovada aguardando gravação.</span>
      ) : confirmando ? (
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-secondary">Gravar {pendentes} alteração(ões) no SIMO agora? Isso grava dado real.</span>
          <button onClick={aplicar} className="rounded-lg bg-status-warning px-3 py-1.5 font-semibold text-white hover:opacity-90">
            Sim, gravar
          </button>
          <button onClick={() => setConfirmando(false)} className="rounded-lg px-2 py-1.5 text-ink-muted hover:text-ink-primary">
            Cancelar
          </button>
        </span>
      ) : (
        <button
          disabled={carregando || pendentes === 0}
          onClick={() => setConfirmando(true)}
          className="rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {carregando ? "Gravando..." : `Aplicar ${pendentes} sugestão(ões) aprovada(s) no SIMO`}
        </button>
      )}

      {erro && <p className="mt-2 text-xs text-status-critical">❌ {erro}</p>}

      {ultimoResultado && (
        <div className="mt-3 rounded-lg border border-black/5 bg-plane p-3">
          <p className="mb-2 text-xs font-medium text-ink-secondary">
            {ultimoResultado.sucesso} gravada(s), {ultimoResultado.falha} a verificar
            {ultimoResultado.restantes > 0 ? ` — ${ultimoResultado.restantes} restante(s), rode de novo pra continuar.` : "."}
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {ultimoResultado.detalhes.map((d) => {
              const ok = /^Sucesso/.test(d.resultado);
              return (
                <li key={d.idAcao} className="flex items-start gap-2 text-xs">
                  {ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-status-good" />
                  ) : (
                    <XCircle size={14} className="mt-0.5 shrink-0 text-status-critical" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-ink-primary">
                      <IdAcaoLink id={d.idAcao} /> · {d.nomeAcao || "—"}
                    </p>
                    <p className="text-ink-muted">
                      → {d.unidade}
                      {d.quantidade ? ` (${d.quantidade})` : ""} — {d.resultado}
                    </p>
                  </div>
                </li>
              );
            })}
            {ultimoResultado.detalhes.length === 0 && <li className="text-ink-muted">Nenhuma linha processada.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

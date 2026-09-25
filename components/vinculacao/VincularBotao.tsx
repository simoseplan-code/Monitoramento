"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type Detalhe = { idAcao: string; nomeAcao: string; resultado: string };

export function VincularBotao({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{ sucesso: number; falha: number; restantes: number; detalhes: Detalhe[] } | null>(null);

  async function vincular() {
    setConfirmando(false);
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/vincular", { method: "POST" });
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
        <span className="text-xs text-ink-muted">Nenhuma ação pendente com número válido (8 dígitos) no momento.</span>
      ) : confirmando ? (
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-secondary">Vincular {pendentes} ação(ões) no SIMO agora? Isso grava dado real.</span>
          <button onClick={vincular} className="rounded-lg bg-status-warning px-3 py-1.5 font-semibold text-white hover:opacity-90">
            Sim, vincular
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
          {carregando ? "Vinculando..." : `Vincular ${pendentes} ação(ões) válida(s) no SIMO`}
        </button>
      )}

      {erro && <p className="mt-2 text-xs text-status-critical">❌ {erro}</p>}

      {ultimoResultado && (
        <div className="mt-3 rounded-lg border border-black/5 bg-plane p-3">
          <p className="mb-2 text-xs font-medium text-ink-secondary">
            {ultimoResultado.sucesso} vinculada(s), {ultimoResultado.falha} falharam
            {ultimoResultado.restantes > 0 ? ` — ${ultimoResultado.restantes} restante(s), rode de novo pra continuar.` : "."}
            {ultimoResultado.sucesso > 0 ? " Rode \"Sincronizar agora\" pra atualizar o Número Automático na base." : ""}
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {ultimoResultado.detalhes.map((d, i) => {
              const ok = d.resultado === "Sucesso";
              return (
                <li key={`${d.idAcao}-${i}`} className="flex items-start gap-2 text-xs">
                  {ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-status-good" />
                  ) : (
                    <XCircle size={14} className="mt-0.5 shrink-0 text-status-critical" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-ink-primary">
                      <IdAcaoLink id={d.idAcao} /> · {d.nomeAcao || "—"}
                    </p>
                    <p className="text-ink-muted">{d.resultado}</p>
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

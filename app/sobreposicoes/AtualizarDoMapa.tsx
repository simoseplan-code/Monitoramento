"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type Resumo = {
  simulacao: boolean;
  toleranciaM: number;
  total: number;
  novos: number;
  jaExistiam: number;
  analiseReaproveitada: number;
  removidos: number;
  analisadosMantidos: number;
  acoesComTracado: number;
  acoesDeKml?: number;
};

const n = (v: number) => v.toLocaleString("pt-BR");

// Atualiza as Sobreposições direto dos traçados que o mapa publica todo dia (sem CSV).
// Primeiro SIMULA e mostra o que mudaria; só grava depois que a pessoa confirma.
export function AtualizarDoMapa() {
  const router = useRouter();
  const [fase, setFase] = useState<"parado" | "simulando" | "confirmar" | "aplicando">("parado");
  const [previa, setPrevia] = useState<Resumo | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function chamar(simular: boolean): Promise<Resumo | null> {
    try {
      const resp = await fetch("/api/sobreposicoes/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simular }),
      });
      const json = (await resp.json().catch(() => ({}))) as Resumo & { error?: string };
      if (!resp.ok) {
        setResultado({ tipo: "erro", texto: json.error ?? "Não foi possível atualizar." });
        return null;
      }
      return json;
    } catch {
      setResultado({ tipo: "erro", texto: "Sem conexão com o servidor." });
      return null;
    }
  }

  async function simular() {
    setFase("simulando");
    setResultado(null);
    const r = await chamar(true);
    if (r) {
      setPrevia(r);
      setFase("confirmar");
    } else setFase("parado");
  }

  async function aplicar() {
    setFase("aplicando");
    const r = await chamar(false);
    setFase("parado");
    if (!r) return;
    setPrevia(null);
    setResultado({
      tipo: "ok",
      texto:
        `Atualizado direto do mapa (tolerância de ${r.toleranciaM} m): ${n(r.total)} local(is), ${n(r.novos)} novo(s), ${n(r.jaExistiam)} já existiam` +
        (r.analiseReaproveitada > 0 ? `, ${n(r.analiseReaproveitada)} com análise anterior passada para a chave nova` : "") +
        `. ${n(r.removidos)} sem análise removido(s)` +
        (r.analisadosMantidos > 0 ? `, ${n(r.analisadosMantidos)} já analisado(s) mantido(s).` : "."),
    });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-primary">Atualizar direto do mapa</p>
          <p className="text-xs text-ink-muted">
            Usa os mesmos traçados que o mapa publica todo dia, mais os KMLs já guardados das ações que ainda não estão no mapa, com tolerância de 15 m, sem CSV. Antes de gravar, mostra o que vai mudar.
            O que já foi analisado nunca é apagado.
          </p>
        </div>
        <button
          onClick={simular}
          disabled={fase !== "parado"}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-series-1 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {fase === "simulando" || fase === "aplicando" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {fase === "simulando" ? "Conferindo o que muda..." : fase === "aplicando" ? "Atualizando..." : "Atualizar sobreposições"}
        </button>
      </div>

      {fase === "confirmar" && previa && (
        <div className="mt-3 space-y-2 rounded-lg border border-status-warning/30 bg-status-warning-bg/40 p-3 text-xs text-ink-secondary">
          <p className="font-semibold text-ink-primary">Isto é só uma prévia. Nada foi gravado ainda. Se confirmar:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <strong>{n(previa.total)}</strong> locais detectados em {n(previa.acoesComTracado)} ações do mapa
              {previa.acoesDeKml ? <> e em <strong>{n(previa.acoesDeKml)}</strong> ação(ões) que só têm KML guardado</> : null}.
            </li>
            <li>
              <strong>{n(previa.novos)}</strong> entram como novos (aguardando revisão).
            </li>
            <li>
              <strong>{n(previa.jaExistiam)}</strong> já existem e mantêm a análise.
            </li>
            <li>
              <strong>{n(previa.analiseReaproveitada)}</strong> análises passam para a chave nova (mesma combinação de obras).
            </li>
            <li>
              <strong>{n(previa.analisadosMantidos)}</strong> já analisados que não aparecem mais ficam guardados.
            </li>
            <li>
              <strong>{n(previa.removidos)}</strong> sem nenhuma análise saem da lista.
            </li>
          </ul>
          <div className="flex gap-2 pt-1">
            <button onClick={aplicar} className="rounded-lg bg-status-good px-3 py-1.5 font-semibold text-white hover:opacity-90">
              Confirmar e atualizar
            </button>
            <button
              onClick={() => {
                setFase("parado");
                setPrevia(null);
              }}
              className="rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            resultado.tipo === "ok" ? "bg-status-good-bg text-status-good" : "bg-status-warning-bg text-status-warning"
          }`}
        >
          {resultado.texto}
        </p>
      )}
    </div>
  );
}

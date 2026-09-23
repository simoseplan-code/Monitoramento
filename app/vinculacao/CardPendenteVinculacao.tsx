"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";

export function CardPendenteVinculacao({
  idAcao,
  nomeAcao,
  orgao,
  estagioAtual,
  status,
  numeroSiafe,
  situacao,
  falhouAntes,
  isAdmin,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  estagioAtual: string | null;
  status: string | null;
  numeroSiafe: string;
  situacao: string | null;
  falhouAntes: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pronta = !situacao;
  // Retry individual só faz sentido quando o número tem o formato certo
  // (senão não há o que reenviar pro SIMO) — cobre tanto "pronta" quanto
  // "falhou antes com esse número" (a pessoa corrigiu algo no SIMO e
  // quer tentar de novo sem esperar o lote).
  const podeTentar = /^\d{8}$/.test(numeroSiafe.trim());

  const [tentando, setTentando] = useState(false);
  const [resultado, setResultado] = useState<{ sucesso: boolean; texto: string } | null>(null);

  async function tentar() {
    setTentando(true);
    setResultado(null);
    try {
      const resp = await fetch("/api/admin/vincular-uma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setResultado({ sucesso: false, texto: data.error ?? "Falha ao tentar vincular." });
      } else {
        setResultado({ sucesso: data.sucesso, texto: data.resultado });
      }
      router.refresh();
    } finally {
      setTentando(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 shadow-card ${pronta ? "border-black/5 bg-surface" : "border-status-critical/20 bg-status-critical-bg"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            {idAcao} · {orgao ?? "Sem órgão"} {estagioAtual ? `· ${estagioAtual}` : ""} {status ? `· ${status}` : ""}
          </p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
            pronta ? "bg-status-good-bg text-status-good" : "bg-status-critical-bg text-status-critical"
          }`}
        >
          {pronta ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={13} />}
          {pronta ? "Pronta pra vincular" : "Precisa de correção"}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        Número do Contrato no SIAFE: <strong className="text-ink-primary">{numeroSiafe || "—"}</strong>
      </p>
      {situacao && (
        <p className="mt-1 text-xs text-status-critical">
          ⚠️ {situacao}
          {falhouAntes && " — não entra automaticamente em \"Vincular todas\" até o número mudar ou alguém tentar de novo aqui."}
        </p>
      )}

      {isAdmin && podeTentar && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={tentar}
            disabled={tentando}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-50"
          >
            <RefreshCw size={13} className={tentando ? "animate-spin" : ""} />
            {tentando ? "Tentando..." : "Tentar vincular agora"}
          </button>
          {resultado && (
            <span className={`text-xs ${resultado.sucesso ? "text-status-good" : "text-status-critical"}`}>
              {resultado.sucesso ? "✅ " : "❌ "}
              {resultado.texto}
              {resultado.sucesso && " — rode \"Sincronizar agora\" pra atualizar aqui."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

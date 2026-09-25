"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Undo2 } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type Status = "pendente" | "corrigido" | "problema";

export function CardTermo({
  idAcao,
  nomeAcao,
  orgao,
  dataCriacao,
  recebDefinitivo,
  recebProvisorio,
  tipoDocumento,
  numeroAutomatico,
  statusInicial,
  observacaoInicial,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  dataCriacao: string | null;
  recebDefinitivo: string | null;
  recebProvisorio: string | null;
  tipoDocumento: string;
  numeroAutomatico: string | null;
  statusInicial: Status;
  observacaoInicial: string | null;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"fechado" | "escrevendo">("fechado");
  const [decisao, setDecisao] = useState<"corrigido" | "problema">("problema");
  const [observacao, setObservacao] = useState(observacaoInicial ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(novoStatus: Status, obs?: string) {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/termos/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, status: novoStatus, observacao: obs ?? "" }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setErro(data.error ?? "Falha ao salvar.");
        return;
      }
      setEtapa("fechado");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  const status = statusInicial;
  const formatar = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const abrir = (d: "corrigido" | "problema") => {
    setDecisao(d);
    setEtapa("escrevendo");
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-card ${
        status === "corrigido"
          ? "border-status-good/20 bg-status-good-bg"
          : status === "problema"
            ? "border-status-warning/20 bg-status-warning-bg"
            : "border-black/5 bg-surface"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            <IdAcaoLink id={idAcao} /> · {orgao ?? "Sem órgão"} · criada em {formatar(dataCriacao)}
            {numeroAutomatico ? ` · Contrato ${numeroAutomatico}` : ""}
          </p>
          <p className="text-xs text-ink-muted">
            Receb. definitivo: <strong className="text-ink-secondary">{formatar(recebDefinitivo)}</strong> · Receb. provisório:{" "}
            <strong className="text-ink-secondary">{formatar(recebProvisorio)}</strong>
          </p>
        </div>
        {status !== "pendente" && (
          <button
            onClick={() => salvar("pendente")}
            disabled={salvando}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-white disabled:opacity-50"
            title="Reabrir conferência"
          >
            <Undo2 size={13} />
            Reabrir
          </button>
        )}
      </div>

      <p className="mb-3">
        <span className="rounded-full bg-series-1/10 px-2.5 py-1 text-[11px] font-semibold text-series-1">{tipoDocumento}</span>
      </p>

      {status !== "pendente" && observacaoInicial && etapa === "fechado" && (
        <p
          className={`mb-3 rounded-lg border bg-white/60 px-3 py-2 text-xs text-ink-secondary ${
            status === "corrigido" ? "border-status-good/20" : "border-status-warning/20"
          }`}
        >
          <strong className={status === "corrigido" ? "text-status-good" : "text-status-warning"}>Observação:</strong> {observacaoInicial}
        </p>
      )}

      {status === "pendente" && etapa === "fechado" && (
        <div className="flex gap-2">
          <button
            onClick={() => abrir("corrigido")}
            className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <CheckCircle2 size={13} />
            Corrigido
          </button>
          <button
            onClick={() => abrir("problema")}
            className="flex items-center gap-1.5 rounded-full bg-status-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <AlertTriangle size={13} />
            Tem problema
          </button>
        </div>
      )}

      {status === "problema" && etapa === "fechado" && (
        <button
          onClick={() => abrir("corrigido")}
          className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <CheckCircle2 size={13} />
          Marcar como corrigido
        </button>
      )}

      {etapa === "escrevendo" && (
        <div className="space-y-2">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={decisao === "corrigido" ? "O que foi corrigido? (opcional)" : "Qual é o problema? (opcional)"}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => salvar(decisao, observacao)}
              disabled={salvando}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
                decisao === "corrigido" ? "bg-status-good" : "bg-status-warning"
              }`}
            >
              {salvando ? "Salvando..." : decisao === "corrigido" ? "Confirmar correção" : "Confirmar problema"}
            </button>
            <button
              onClick={() => setEtapa("fechado")}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-status-critical">❌ {erro}</p>}
    </div>
  );
}

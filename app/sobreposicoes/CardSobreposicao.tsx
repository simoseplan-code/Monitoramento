"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Undo2, MapPin, Star } from "lucide-react";
import type { ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type StatusRevisao = "pendente" | "ok" | "problema";

// A ação com o menor ID é a mais antiga no SIMO — normalmente a
// "original", que as outras do mesmo local estão duplicando. Vai
// primeiro na lista, marcada como Principal, pra saber qual olhar antes.
function ordenarComPrincipalPrimeiro(obras: ObraNoLocal[]): ObraNoLocal[] {
  return [...obras].sort((a, b) => {
    const idA = a.id ? parseInt(a.id, 10) : Infinity;
    const idB = b.id ? parseInt(b.id, 10) : Infinity;
    return (isNaN(idA) ? Infinity : idA) - (isNaN(idB) ? Infinity : idB);
  });
}

// Texto do status de cada obra: em desenvolvimento mostra o percentual;
// concluída mostra a data (recebimento definitivo, ou o provisório se
// ainda não houver definitivo).
function textoStatus(o: ObraNoLocal): string {
  const status = o.status || "Sem status";
  if (/^conclu[ií]do$/i.test(status.trim())) {
    return o.concluido_em
      ? `Concluído em ${new Date(o.concluido_em + "T00:00:00").toLocaleDateString("pt-BR")}`
      : "Concluído (sem data de recebimento)";
  }
  if (/^em desenvolvimento$/i.test(status.trim()) && o.percentual != null) {
    const pct = (o.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${status} · ${pct}% executado`;
  }
  return status;
}

export function CardSobreposicao({
  chaveLocal,
  obras,
  extensaoM,
  toleranciaM,
  qtdSegmentos,
  latInicio,
  lonInicio,
  latFim,
  lonFim,
  statusInicial,
  observacaoInicial,
}: {
  chaveLocal: string;
  obras: ObraNoLocal[];
  extensaoM: number | null;
  toleranciaM: number | null;
  qtdSegmentos: number | null;
  latInicio: number | null;
  lonInicio: number | null;
  latFim: number | null;
  lonFim: number | null;
  statusInicial: StatusRevisao;
  observacaoInicial: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(statusInicial);
  // "escrevendo": campo de comentário aberto para a decisão escolhida
  // (ok ou problema) — os dois botões passam pelo mesmo campo.
  const [etapa, setEtapa] = useState<"fechado" | "escrevendo">("fechado");
  const [decisao, setDecisao] = useState<"ok" | "problema">("problema");
  const [observacao, setObservacao] = useState(observacaoInicial ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(novoStatus: StatusRevisao, obs?: string) {
    setSalvando(true);
    try {
      await fetch("/api/sobreposicoes/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaveLocal, status: novoStatus, observacao: obs ?? "" }),
      });
      setStatus(novoStatus);
      setEtapa("fechado");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  const linkMapa =
    latInicio != null && lonInicio != null ? `https://www.google.com/maps?q=${latInicio},${lonInicio}` : null;

  return (
    <div
      className={`rounded-xl border p-4 shadow-card transition-colors ${
        status === "ok"
          ? "border-status-good/20 bg-status-good-bg"
          : status === "problema"
            ? "border-status-warning/20 bg-status-warning-bg"
            : "border-black/5 bg-surface"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-primary">
            {obras.length} obras envolvidas · {extensaoM != null ? `${Math.round(extensaoM)} m` : "—"} sobrepostos
          </p>
          <p className="text-xs text-ink-muted">
            Tolerância {toleranciaM ?? "—"} m · {qtdSegmentos ?? "—"} segmento(s)
            {linkMapa && (
              <>
                {" · "}
                <a href={linkMapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-series-1 hover:underline">
                  <MapPin size={12} /> Ver início no mapa
                </a>
              </>
            )}
          </p>
        </div>

        {status !== "pendente" && (
          <button
            onClick={() => salvar("pendente")}
            disabled={salvando}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-white disabled:opacity-50"
            title="Reabrir revisão"
          >
            <Undo2 size={13} />
            Reabrir
          </button>
        )}
      </div>

      <ul className="mb-3 space-y-1.5">
        {ordenarComPrincipalPrimeiro(obras).map((o, i) => (
          <li
            key={i}
            className={`rounded-lg px-3 py-2 text-xs ${i === 0 ? "border border-series-1/30 bg-series-1/5" : "bg-plane"}`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {i === 0 && (
                <span className="flex items-center gap-1 rounded-full bg-series-1 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Star size={10} strokeWidth={3} />
                  Principal
                </span>
              )}
              <span className="rounded-full bg-series-1/10 px-2 py-0.5 text-[11px] font-semibold text-series-1">
                {o.orgao || "Sem órgão"}
              </span>
              <p className="font-medium text-ink-primary">{o.nome}</p>
            </div>
            <p className="text-ink-muted">
              {o.id ? <IdAcaoLink id={o.id}>ID {o.id}</IdAcaoLink> : "Sem ID"} · {textoStatus(o)}
              {o.contrato
                ? ` · Contrato ${o.contrato}`
                : o.siafe_nao_vinculado
                  ? ` · SIAFE ${o.siafe_nao_vinculado} (ainda não vinculado)`
                  : " · Sem contrato SIAFE"}
            </p>
          </li>
        ))}
      </ul>

      {status !== "pendente" && observacaoInicial && etapa === "fechado" && (
        <p
          className={`mb-3 rounded-lg border bg-white/60 px-3 py-2 text-xs text-ink-secondary ${
            status === "ok" ? "border-status-good/20" : "border-status-warning/20"
          }`}
        >
          <strong className={status === "ok" ? "text-status-good" : "text-status-warning"}>Observação:</strong> {observacaoInicial}
        </p>
      )}

      {status === "pendente" && etapa === "fechado" && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDecisao("ok");
              setEtapa("escrevendo");
            }}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            Sem problema
          </button>
          <button
            onClick={() => {
              setDecisao("problema");
              setEtapa("escrevendo");
            }}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-full bg-status-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle size={13} />
            Tem problema
          </button>
        </div>
      )}

      {etapa === "escrevendo" && (
        <div className="space-y-2">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={decisao === "ok" ? "Comentário sobre a análise (opcional)" : "O que está errado aqui? (opcional)"}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => salvar(decisao, observacao)}
              disabled={salvando}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
                decisao === "ok" ? "bg-status-good" : "bg-status-warning"
              }`}
            >
              {salvando ? "Salvando..." : decisao === "ok" ? "Confirmar sem problema" : "Confirmar problema"}
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
    </div>
  );
}

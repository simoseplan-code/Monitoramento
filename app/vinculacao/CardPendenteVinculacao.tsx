import { AlertTriangle, Check } from "lucide-react";

export function CardPendenteVinculacao({
  idAcao,
  nomeAcao,
  orgao,
  estagioAtual,
  status,
  numeroSiafe,
  situacao,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  estagioAtual: string | null;
  status: string | null;
  numeroSiafe: string;
  situacao: string | null;
}) {
  const pronta = !situacao;

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
      {situacao && <p className="mt-1 text-xs text-status-critical">⚠️ {situacao}</p>}
    </div>
  );
}

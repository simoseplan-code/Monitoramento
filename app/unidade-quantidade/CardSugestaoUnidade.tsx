import { AlertTriangle } from "lucide-react";
import { AprovarSugestaoBotao } from "./AprovarSugestaoBotao";

const MARCADOR_MANTER_QUANTIDADE = "✓ manter atual";

export function CardSugestaoUnidade({
  idAcao,
  nomeAcao,
  orgao,
  tipologia,
  unidadeAtual,
  quantidadeAtual,
  unidadeSugerida,
  quantidadeSugerida,
  semQuantidade,
  confianca,
  avisoTipologia,
  motivo,
  aprovado,
  aplicadoEm,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  tipologia: string | null;
  unidadeAtual: string | null;
  quantidadeAtual: string | null;
  unidadeSugerida: string;
  quantidadeSugerida: string | null;
  semQuantidade: boolean;
  confianca: "alta" | "baixa";
  avisoTipologia: boolean;
  motivo: string;
  aprovado: boolean;
  aplicadoEm: string | null;
}) {
  const corBorda = avisoTipologia
    ? "border-series-1/30 bg-series-1/5"
    : confianca === "alta"
      ? "border-status-good/20 bg-status-good-bg"
      : "border-status-warning/20 bg-status-warning-bg";

  return (
    <div className={`rounded-xl border p-4 shadow-card ${corBorda}`}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            {idAcao} · {orgao ?? "Sem órgão"} {tipologia ? `· ${tipologia}` : ""}
          </p>
        </div>
        {aplicadoEm ? (
          <span className="shrink-0 rounded-full bg-status-good-bg px-3 py-1.5 text-xs font-medium text-status-good">
            Aplicado no SIMO
          </span>
        ) : (
          <AprovarSugestaoBotao idAcao={idAcao} aprovado={aprovado} />
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg border border-black/10 bg-surface px-2.5 py-1 text-ink-secondary">
          Atual: <strong className="text-ink-primary">{unidadeAtual || "—"}</strong>
          {unidadeAtual && quantidadeAtual ? ` (${quantidadeAtual})` : ""}
        </span>
        <span className="text-ink-muted">→</span>
        <span
          className={`rounded-lg px-2.5 py-1 font-medium ${
            avisoTipologia ? "bg-series-1/10 text-series-1" : confianca === "alta" ? "bg-status-good text-white" : "bg-status-warning text-white"
          }`}
        >
          {unidadeSugerida}
          {semQuantidade ? ` (${MARCADOR_MANTER_QUANTIDADE})` : quantidadeSugerida ? ` (${quantidadeSugerida})` : ""}
        </span>
        <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs text-ink-muted">
          Confiança {confianca === "alta" ? "alta" : "baixa"}
        </span>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-ink-secondary">
        {avisoTipologia && <AlertTriangle size={13} className="mt-0.5 shrink-0 text-series-1" />}
        {motivo}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChecklistItem } from "./ChecklistItem";
import { ConcluirBotao } from "./ConcluirBotao";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";

const CHECKS = [
  { campo: "kml_anexado" as const, label: "KML anexado" },
  { campo: "sem_duplicacao" as const, label: "Sem duplicação" },
  { campo: "trecho_unico" as const, label: "Trecho único" },
  { campo: "documentos_obrigatorios" as const, label: "Documentos obrigatórios inseridos" },
];

export function CardNovaAcao({
  idAcao,
  nomeAcao,
  orgao,
  dataCriacao,
  statusInicial,
  concluido,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  dataCriacao: string;
  statusInicial: {
    kml_anexado: Status;
    sem_duplicacao: Status;
    trecho_unico: Status;
    documentos_obrigatorios: Status;
  };
  concluido: boolean;
}) {
  // Estado local pros 4 checks — clicar num item atualiza só este
  // card na hora, sem pedir pro Next.js re-renderizar a página inteira
  // (que numa lista de dezenas de ações ficava perceptivelmente lento).
  const [status, setStatus] = useState(statusInicial);

  const tudoConfirmado = Object.values(status).every((v) => v === "confirmado");

  return (
    <div
      className={`rounded-xl border p-4 shadow-card transition-colors ${
        concluido ? "border-status-good/20 bg-status-good-bg" : "border-black/5 bg-surface"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            {idAcao} · {orgao ?? "Sem órgão"} · criada em{" "}
            {dataCriacao ? new Date(dataCriacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
        {(tudoConfirmado || concluido) && <ConcluirBotao idAcao={idAcao} concluido={concluido} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {CHECKS.map((c) => (
          <ChecklistItem
            key={c.campo}
            idAcao={idAcao}
            campo={c.campo}
            label={c.label}
            status={status[c.campo]}
            onSalvo={(novoStatus) => setStatus((s) => ({ ...s, [c.campo]: novoStatus }))}
          />
        ))}
      </div>
    </div>
  );
}

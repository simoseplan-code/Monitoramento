"use client";

import { useState } from "react";
import { Check, AlertTriangle } from "lucide-react";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";
type Campo = "kml_anexado" | "sem_duplicacao" | "documentos_obrigatorios";

const PILL_BASE = "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

export function ChecklistItem({
  idAcao,
  campo,
  label,
  status,
  onSalvo,
}: {
  idAcao: string;
  campo: Campo;
  label: string;
  status: Status;
  onSalvo: (novoStatus: Status) => void;
}) {
  // "fechado" = pill normal | "escolhendo" = mostra as opções | "confirmando_x" = pede a segunda confirmação
  const [etapa, setEtapa] = useState<"fechado" | "escolhendo" | "confirmando_confirmado" | "confirmando_aguardando">(
    "fechado"
  );
  const [salvando, setSalvando] = useState(false);

  // Atualiza a tela na hora (sem esperar o servidor re-renderizar a
  // página inteira) e só then salva de verdade — se a chamada falhar,
  // o próprio card volta a ficar coerente na próxima ação do usuário.
  async function salvar(novoStatus: Status) {
    setSalvando(true);
    onSalvo(novoStatus);
    setEtapa("fechado");
    try {
      await fetch("/api/revisao/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, campo, status: novoStatus }),
      });
    } finally {
      setSalvando(false);
    }
  }

  if (etapa === "confirmando_confirmado") {
    return (
      <span className={`${PILL_BASE} bg-status-good-bg text-status-good`}>
        Confirma &quot;{label}&quot;?
        <button onClick={() => salvar("confirmado")} disabled={salvando} className="rounded-full bg-status-good px-2 py-0.5 text-white disabled:opacity-50">
          Sim
        </button>
        <button onClick={() => setEtapa("fechado")} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
          Não
        </button>
      </span>
    );
  }

  if (etapa === "confirmando_aguardando") {
    return (
      <span className={`${PILL_BASE} bg-status-warning-bg text-status-warning`}>
        Marcar &quot;{label}&quot; como aguardando atualização?
        <button onClick={() => salvar("aguardando_atualizacao")} disabled={salvando} className="rounded-full bg-status-warning px-2 py-0.5 text-white disabled:opacity-50">
          Sim
        </button>
        <button onClick={() => setEtapa("fechado")} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
          Não
        </button>
      </span>
    );
  }

  if (etapa === "escolhendo") {
    return (
      <span className={`${PILL_BASE} border border-black/10 bg-plane text-ink-secondary`}>
        {label}
        {status !== "confirmado" && (
          <button onClick={() => setEtapa("confirmando_confirmado")} className="rounded-full bg-status-good px-2 py-0.5 text-white">
            Confirmar
          </button>
        )}
        {status !== "aguardando_atualizacao" && (
          <button onClick={() => setEtapa("confirmando_aguardando")} className="rounded-full bg-status-warning px-2 py-0.5 text-white">
            Aguardando atualização
          </button>
        )}
        {status !== "pendente" && (
          <button onClick={() => salvar("pendente")} disabled={salvando} className="rounded-full bg-ink-muted px-2 py-0.5 text-white disabled:opacity-50">
            Desmarcar
          </button>
        )}
        <button onClick={() => setEtapa("fechado")} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
          Cancelar
        </button>
      </span>
    );
  }

  if (status === "confirmado") {
    return (
      <button onClick={() => setEtapa("escolhendo")} className={`${PILL_BASE} bg-status-good-bg text-status-good hover:opacity-80`}>
        <Check size={12} strokeWidth={3} />
        {label}
      </button>
    );
  }

  if (status === "aguardando_atualizacao") {
    return (
      <button onClick={() => setEtapa("escolhendo")} className={`${PILL_BASE} bg-status-warning-bg text-status-warning hover:opacity-80`}>
        <AlertTriangle size={12} strokeWidth={2.5} />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={() => setEtapa("escolhendo")}
      className={`${PILL_BASE} border border-black/10 text-ink-secondary hover:bg-plane`}
    >
      {label}
    </button>
  );
}

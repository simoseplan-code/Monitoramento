"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";

export function ChecklistItem({
  idAcao,
  campo,
  label,
  marcado,
}: {
  idAcao: string;
  campo: "kml_anexado" | "sem_duplicacao" | "trecho_unico" | "documentos_obrigatorios";
  label: string;
  marcado: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    try {
      await fetch("/api/revisao/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, campo, valor: true }),
      });
      router.refresh();
    } finally {
      setSalvando(false);
      setConfirmando(false);
    }
  }

  if (marcado) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-status-good-bg px-2.5 py-1 text-xs font-medium text-status-good">
        <Check size={12} strokeWidth={3} />
        {label}
      </span>
    );
  }

  if (confirmando) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-status-warning-bg px-2 py-1 text-xs font-medium text-status-warning">
        Confirma &quot;{label}&quot;?
        <button
          onClick={confirmar}
          disabled={salvando}
          className="rounded-full bg-status-warning px-2 py-0.5 text-white disabled:opacity-50"
        >
          {salvando ? "..." : "Sim"}
        </button>
        <button onClick={() => setConfirmando(false)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-plane"
    >
      {label}
    </button>
  );
}

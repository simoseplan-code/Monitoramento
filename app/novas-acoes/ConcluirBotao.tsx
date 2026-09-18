"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, Undo2 } from "lucide-react";

export function ConcluirBotao({ idAcao, concluido }: { idAcao: string; concluido: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar(valor: boolean) {
    setSalvando(true);
    try {
      await fetch("/api/revisao/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, concluido: valor }),
      });
      router.refresh();
    } finally {
      setSalvando(false);
      setConfirmando(false);
    }
  }

  if (concluido) {
    return (
      <button
        onClick={() => salvar(false)}
        disabled={salvando}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-status-good hover:bg-white disabled:opacity-50"
        title="Reabrir análise"
      >
        <Undo2 size={13} />
        Reabrir
      </button>
    );
  }

  if (confirmando) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-good-bg px-2 py-1 text-xs font-medium text-status-good">
        Concluir análise?
        <button onClick={() => salvar(true)} disabled={salvando} className="rounded-full bg-status-good px-2 py-0.5 text-white disabled:opacity-50">
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
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
    >
      <CheckCheck size={13} />
      Concluir análise
    </button>
  );
}

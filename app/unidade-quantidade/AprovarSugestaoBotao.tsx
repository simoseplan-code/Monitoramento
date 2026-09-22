"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Undo2 } from "lucide-react";

export function AprovarSugestaoBotao({ idAcao, aprovado }: { idAcao: string; aprovado: boolean }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);

  async function salvar(valor: boolean) {
    setSalvando(true);
    try {
      await fetch("/api/unidade/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, aprovado: valor }),
      });
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  if (aprovado) {
    return (
      <button
        onClick={() => salvar(false)}
        disabled={salvando}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-status-good hover:bg-white disabled:opacity-50"
        title="Desfazer aprovação"
      >
        <Undo2 size={13} />
        Aprovado
      </button>
    );
  }

  return (
    <button
      onClick={() => salvar(true)}
      disabled={salvando}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
    >
      <Check size={13} />
      Aprovar sugestão
    </button>
  );
}

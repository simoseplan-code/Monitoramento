"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AprovarBotoes({ userId }: { userId: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);

  async function agir(acao: "aprovar" | "rejeitar") {
    setCarregando(true);
    try {
      await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, acao }),
      });
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={carregando}
        onClick={() => agir("aprovar")}
        className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Aprovar
      </button>
      <button
        disabled={carregando}
        onClick={() => agir("rejeitar")}
        className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Rejeitar
      </button>
    </div>
  );
}

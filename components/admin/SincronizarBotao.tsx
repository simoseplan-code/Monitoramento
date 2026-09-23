"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SincronizarBotao() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sincronizar() {
    setCarregando(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/admin/sync-simo", { method: "POST" });
      const data = await resp.json();
      setMsg(resp.ok ? `✅ ${data.linhas} ações sincronizadas.` : `❌ ${data.error}`);
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      <button
        disabled={carregando}
        onClick={sincronizar}
        className="rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {carregando ? "Sincronizando..." : "Sincronizar agora"}
      </button>
    </div>
  );
}

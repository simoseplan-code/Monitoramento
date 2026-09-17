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
      {msg && <span className="text-sm">{msg}</span>}
      <button
        disabled={carregando}
        onClick={sincronizar}
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {carregando ? "Sincronizando..." : "Sincronizar agora"}
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function SincronizarBotao() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function sincronizar() {
    setCarregando(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/admin/sync-simo", { method: "POST" });
      // Resposta que não é JSON = o servidor foi cortado antes de responder
      // (timeout devolve página de erro) — mostra o status em vez de esconder.
      const bruto = await resp.text();
      let data: { linhas?: number; error?: string } | null = null;
      try {
        data = JSON.parse(bruto);
      } catch {
        // não é JSON
      }
      setMsg(
        data && resp.ok
          ? { tipo: "ok", texto: `✅ ${data.linhas} ações sincronizadas.` }
          : { tipo: "erro", texto: `❌ ${data?.error ?? `Servidor respondeu HTTP ${resp.status} sem detalhes (provável timeout — veja o histórico no Admin).`}` }
      );
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "❌ Falha ao conectar com o servidor." });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span className={`text-xs ${msg.tipo === "ok" ? "text-status-good" : "text-status-critical"}`}>{msg.texto}</span>
      )}
      <button
        disabled={carregando}
        onClick={sincronizar}
        className="flex items-center gap-1.5 rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {carregando && <Loader2 size={13} className="animate-spin" />}
        {carregando ? "Sincronizando..." : "Sincronizar agora"}
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, UserCheck, ClipboardList, Download } from "lucide-react";

export function QuickActions({ isAdmin, pendentesAprovacao }: { isAdmin: boolean; pendentesAprovacao: number }) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sincronizar() {
    setSincronizando(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/admin/sync-simo", { method: "POST" });
      const data = await resp.json();
      setMsg(resp.ok ? `${data.linhas} ações sincronizadas.` : data.error);
      router.refresh();
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <h3 className="mb-3 text-sm font-semibold text-ink-primary">Ações rápidas</h3>
      <div className="space-y-2">
        {isAdmin && (
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="flex w-full items-center gap-3 rounded-lg border border-black/5 px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-plane disabled:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/10 text-series-1">
              <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} />
            </span>
            {sincronizando ? "Sincronizando com o SIMO..." : "Sincronizar com o SIMO"}
          </button>
        )}

        <Link
          href="/acoes?filtro=pendente"
          className="flex w-full items-center gap-3 rounded-lg border border-black/5 px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-plane"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-warning-bg text-status-warning">
            <ClipboardList size={16} />
          </span>
          Ver ações pendentes
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className="flex w-full items-center gap-3 rounded-lg border border-black/5 px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-plane"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-good-bg text-status-good">
              <UserCheck size={16} />
            </span>
            Aprovar cadastros
            {pendentesAprovacao > 0 && (
              <span className="ml-auto rounded-full bg-status-critical-bg px-2 py-0.5 text-xs font-semibold text-status-critical">
                {pendentesAprovacao}
              </span>
            )}
          </Link>
        )}

        <a
          href="/api/acoes/export"
          className="flex w-full items-center gap-3 rounded-lg border border-black/5 px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-plane"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-neutral-bg text-status-neutral">
            <Download size={16} />
          </span>
          Exportar planilha de ações
        </a>
      </div>
      {msg && <p className="mt-3 text-xs text-ink-muted">{msg}</p>}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Bell, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function Topbar({
  titulo,
  subtitulo,
  iniciais,
  notificacoesCount,
}: {
  titulo: string;
  subtitulo?: string;
  iniciais: string;
  notificacoesCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!busca.trim()) return;
    router.push(`/acoes?busca=${encodeURIComponent(busca.trim())}`);
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/5 bg-surface/90 px-6 py-4 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-ink-primary">{titulo}</h1>
        {subtitulo && <p className="truncate text-xs text-ink-muted">{subtitulo}</p>}
      </div>

      <div className="flex items-center gap-3">
        <form onSubmit={buscar} className="relative hidden sm:block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar ação, órgão..."
            className="w-56 rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none focus:ring-2 focus:ring-series-1/20"
          />
        </form>

        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary hover:bg-plane"
          aria-label="Notificações"
        >
          <Bell size={18} />
          {notificacoesCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-status-critical" />
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-series-1 text-xs font-semibold text-white"
          >
            {iniciais || "?"}
          </button>
          {menuAberto && (
            <div className="absolute right-0 top-11 w-40 rounded-lg border border-black/5 bg-surface py-1 shadow-card">
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                  router.refresh();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-plane"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";

// Um órgão da aba "Pendências": linha recolhível com a contagem; os cartões aparecem ao abrir.
export function GrupoOrgaoPendencia({ orgao, quantidade, children }: { orgao: string; quantidade: number; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-xl border border-black/5 bg-surface shadow-card">
      <button onClick={() => setAberto((a) => !a)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={aberto}>
        {aberto ? <ChevronDown size={16} className="shrink-0 text-ink-muted" /> : <ChevronRight size={16} className="shrink-0 text-ink-muted" />}
        <Building2 size={16} className="shrink-0 text-series-1" />
        <span className="truncate text-sm font-semibold text-ink-primary">{orgao}</span>
        <span className="shrink-0 rounded-full bg-status-warning-bg px-2.5 py-0.5 text-xs font-semibold text-status-warning">
          {quantidade} pendência{quantidade > 1 ? "s" : ""}
        </span>
      </button>
      {aberto && <div className="space-y-3 border-t border-black/5 p-3">{children}</div>}
    </section>
  );
}

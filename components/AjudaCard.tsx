"use client";

import { useState } from "react";

// Botão "?" que explica o card: abre ao passar o mouse ou ao clicar/tocar
// (no celular não existe hover), fecha ao sair ou clicar fora.
export function AjudaCard({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setAberto(true)} onMouseLeave={() => setAberto(false)}>
      <button
        type="button"
        aria-label="O que é isto?"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        onBlur={() => setAberto(false)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-[11px] font-semibold leading-none text-ink-muted transition-colors hover:bg-plane hover:text-ink-primary"
      >
        ?
      </button>
      {aberto && (
        <span
          role="tooltip"
          className="absolute right-0 top-6 z-30 w-64 rounded-lg border border-black/10 bg-surface p-3 text-left text-xs font-normal leading-relaxed text-ink-secondary shadow-card"
        >
          {texto}
        </span>
      )}
    </span>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";

export function SobrePainel() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [aberto]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-plane hover:text-ink-primary"
        title="Sobre este painel"
      >
        <HelpCircle size={16} />
      </button>

      {aberto && (
        <div className="absolute left-0 top-8 z-20 w-72 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <div className="mb-2 flex items-start justify-between">
            <p className="text-sm font-semibold text-ink-primary">Sobre este painel</p>
            <button onClick={() => setAberto(false)} className="text-ink-muted hover:text-ink-primary">
              <X size={14} />
            </button>
          </div>
          <p className="mb-2 text-xs text-ink-secondary">
            Desenvolvido por <span className="font-medium text-ink-primary">Tom Munique Marques Morais</span> — Engenheiro de Produção.
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            As análises consideram as ações do relatório do SIMO (AUTOMAÇÃO CONTRATO SIAFE). Ações conveniadas e de
            órgãos sem SIAFE (ex: AGESPISA) e outras exclusões específicas de cada análise são sempre detalhadas
            junto do resultado, pra deixar claro o que ficou de fora e por quê.
          </p>
        </div>
      )}
    </div>
  );
}

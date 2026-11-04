"use client";

import { useEffect, useRef, useState } from "react";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

// Filtro com caixas de seleção (como no Excel): lista de valores para marcar e desmarcar.

export function FiltroCheckbox({
  rotulo,
  opcoes,
  selecionados,
  aoMudar,
}: {
  rotulo: string;
  opcoes: { valor: string; qtd: number }[];
  selecionados: Set<string> | null; // null = todos marcados
  aoMudar: (v: Set<string> | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const marcar = (valor: string, marcado: boolean) => {
    const atual = new Set(selecionados ?? opcoes.map((o) => o.valor));
    if (marcado) atual.add(valor);
    else atual.delete(valor);
    aoMudar(atual.size === opcoes.length ? null : atual);
  };
  const resumo = selecionados === null ? "todos" : selecionados.size === 0 ? "nenhum" : selecionados.size <= 3 ? Array.from(selecionados).sort().join(", ") : `${selecionados.size} de ${opcoes.length}`;

  return (
    <div ref={raiz} className="relative">
      <button onClick={() => setAberto((a) => !a)} className={campo + " flex items-center gap-2 " + (selecionados ? "border-series-1 text-series-1" : "")}>
        {rotulo}: <strong className="font-semibold">{resumo}</strong>
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1.5 w-56 rounded-xl border border-black/10 bg-surface p-2 shadow-card">
          <div className="mb-1.5 flex items-center justify-between px-1 text-[11px]">
            <button onClick={() => aoMudar(null)} className="font-medium text-series-1 hover:underline">
              Marcar todos
            </button>
            <button onClick={() => aoMudar(new Set())} className="font-medium text-ink-muted hover:underline">
              Limpar
            </button>
          </div>
          <ul className="max-h-60 space-y-0.5 overflow-y-auto pr-1">
            {opcoes.map((o) => (
              <li key={o.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink-secondary hover:bg-plane">
                  <input type="checkbox" checked={selecionados ? selecionados.has(o.valor) : true} onChange={(e) => marcar(o.valor, e.target.checked)} className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{o.valor}</span>
                  <span className="tabular shrink-0 text-[10px] text-ink-muted">{inteiro(o.qtd)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

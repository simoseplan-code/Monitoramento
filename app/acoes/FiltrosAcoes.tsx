"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

const FILTROS = [
  { chave: "", label: "Todas" },
  { chave: "pendente", label: "Pendentes" },
  { chave: "vinculada", label: "Vinculadas" },
  { chave: "sem_numero", label: "Sem número" },
  { chave: "dado_incorreto", label: "Dado incorreto" },
];

export function FiltrosAcoes({ buscaAtual, filtroAtual }: { buscaAtual: string; filtroAtual: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaAtual);

  function aplicar(filtro: string, buscaValor: string) {
    const params = new URLSearchParams();
    if (buscaValor) params.set("busca", buscaValor);
    if (filtro) params.set("filtro", filtro);
    router.push(`/acoes${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(filtroAtual, busca);
        }}
        className="relative"
      >
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, ID ou órgão..."
          className="w-full rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none focus:ring-2 focus:ring-series-1/20 sm:w-72"
        />
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            onClick={() => aplicar(f.chave, busca)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtroAtual === f.chave ? "bg-series-1 text-white" : "bg-plane text-ink-secondary hover:bg-black/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

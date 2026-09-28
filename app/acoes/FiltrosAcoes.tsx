"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Download } from "lucide-react";

const FILTROS = [
  { chave: "", label: "Todas" },
  { chave: "pendente", label: "Pendentes" },
  { chave: "vinculada", label: "Vinculadas" },
  { chave: "sem_numero", label: "Sem número" },
  { chave: "dado_incorreto", label: "Dado incorreto" },
];

export function FiltrosAcoes({
  buscaAtual,
  filtroAtual,
  orgaoAtual,
  orgaos,
  deAtual,
  ateAtual,
}: {
  buscaAtual: string;
  filtroAtual: string;
  orgaoAtual: string;
  orgaos: string[];
  deAtual: string;
  ateAtual: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaAtual);

  function montarParams(overrides: { filtro?: string; busca?: string; orgao?: string; de?: string; ate?: string }) {
    const params = new URLSearchParams();
    const buscaValor = overrides.busca ?? busca;
    const filtroValor = overrides.filtro ?? filtroAtual;
    const orgaoValor = overrides.orgao ?? orgaoAtual;
    const deValor = overrides.de ?? deAtual;
    const ateValor = overrides.ate ?? ateAtual;
    if (buscaValor) params.set("busca", buscaValor);
    if (filtroValor) params.set("filtro", filtroValor);
    if (orgaoValor) params.set("orgao", orgaoValor);
    if (deValor) params.set("de", deValor);
    if (ateValor) params.set("ate", ateValor);
    return params;
  }

  function aplicar(overrides: { filtro?: string; busca?: string; orgao?: string; de?: string; ate?: string }) {
    const params = montarParams(overrides);
    router.push(`/acoes${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const campo =
    "rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none";

  return (
    <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({});
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

      <div className="flex flex-wrap items-center gap-3">
        <select value={orgaoAtual} onChange={(e) => aplicar({ orgao: e.target.value })} className={campo}>
          <option value="">Todos os órgãos</option>
          {orgaos.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Criada de
          <input type="date" value={deAtual} onChange={(e) => aplicar({ de: e.target.value })} className={campo} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          até
          <input type="date" value={ateAtual} onChange={(e) => aplicar({ ate: e.target.value })} className={campo} />
        </label>
        {(deAtual || ateAtual) && (
          <button onClick={() => aplicar({ de: "", ate: "" })} className="text-xs text-series-1 hover:underline">
            limpar datas
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            onClick={() => aplicar({ filtro: f.chave })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtroAtual === f.chave ? "bg-series-1 text-white" : "bg-plane text-ink-secondary hover:bg-black/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <a
        href={`/api/acoes/export?${montarParams({}).toString()}`}
        className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
      >
        <Download size={14} />
        Exportar Excel
      </a>
    </div>
  );
}

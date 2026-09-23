"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function FiltrosUnidadeQuantidade({
  buscaAtual,
  orgaoAtual,
  confiancaAtual,
  orgaos,
  mostrarAplicadas,
}: {
  buscaAtual: string;
  orgaoAtual: string;
  confiancaAtual: string;
  orgaos: string[];
  mostrarAplicadas: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaAtual);

  function aplicar(overrides: { busca?: string; orgao?: string; confianca?: string; aplicadas?: boolean }) {
    const params = new URLSearchParams();
    const buscaValor = overrides.busca ?? busca;
    const orgaoValor = overrides.orgao ?? orgaoAtual;
    const confiancaValor = overrides.confianca ?? confiancaAtual;
    const aplicadasValor = overrides.aplicadas ?? mostrarAplicadas;
    if (buscaValor) params.set("busca", buscaValor);
    if (orgaoValor) params.set("orgao", orgaoValor);
    if (confiancaValor) params.set("confianca", confiancaValor);
    if (aplicadasValor) params.set("aplicadas", "1");
    router.push(`/unidade-quantidade${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={(e) => { e.preventDefault(); aplicar({}); }} className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, ID ou órgão..."
            className="w-full rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none focus:ring-2 focus:ring-series-1/20 sm:w-64"
          />
        </form>

        <select
          value={orgaoAtual}
          onChange={(e) => aplicar({ orgao: e.target.value })}
          className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
        >
          <option value="">Todos os órgãos</option>
          {orgaos.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={confiancaAtual}
          onChange={(e) => aplicar({ confianca: e.target.value })}
          className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
        >
          <option value="">Qualquer confiança</option>
          <option value="alta">Confiança alta</option>
          <option value="baixa">Confiança baixa</option>
        </select>
      </div>

      <label className="flex shrink-0 items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={mostrarAplicadas}
          onChange={(e) => aplicar({ aplicadas: e.target.checked })}
          className="h-4 w-4 rounded border-black/20 accent-series-1"
        />
        Mostrar já aplicadas no SIMO
      </label>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function FiltrosSobreposicoes({
  mostrarRevisadas,
  orgaoAtual,
  orgaos,
}: {
  mostrarRevisadas: boolean;
  orgaoAtual: string;
  orgaos: string[];
}) {
  const router = useRouter();

  function aplicar(overrides: { revisadas?: boolean; orgao?: string }) {
    const params = new URLSearchParams();
    const revisadasValor = overrides.revisadas ?? mostrarRevisadas;
    const orgaoValor = overrides.orgao ?? orgaoAtual;
    if (revisadasValor) params.set("revisadas", "1");
    if (orgaoValor) params.set("orgao", orgaoValor);
    router.push(`/sobreposicoes${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
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

      <label className="flex items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={mostrarRevisadas}
          onChange={(e) => aplicar({ revisadas: e.target.checked })}
          className="h-4 w-4 rounded border-black/20 accent-series-1"
        />
        Mostrar locais já revisados
      </label>
    </div>
  );
}

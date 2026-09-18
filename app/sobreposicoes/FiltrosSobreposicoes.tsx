"use client";

import { useRouter } from "next/navigation";

export function FiltrosSobreposicoes({ mostrarRevisadas }: { mostrarRevisadas: boolean }) {
  const router = useRouter();

  function aplicar(revisadas: boolean) {
    const params = new URLSearchParams();
    if (revisadas) params.set("revisadas", "1");
    router.push(`/sobreposicoes${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <label className="flex items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={mostrarRevisadas}
          onChange={(e) => aplicar(e.target.checked)}
          className="h-4 w-4 rounded border-black/20 accent-series-1"
        />
        Mostrar locais já revisados
      </label>
    </div>
  );
}

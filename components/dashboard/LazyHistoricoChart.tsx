"use client";

import dynamic from "next/dynamic";

const HistoricoChart = dynamic(() => import("./HistoricoChart").then((m) => m.HistoricoChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl border border-black/5 bg-surface" />,
});

type Ponto = { data: string; total: number; vinculadas: number; pendentes: number };

export function LazyHistoricoChart({ pontos }: { pontos: Ponto[] }) {
  return <HistoricoChart pontos={pontos} />;
}

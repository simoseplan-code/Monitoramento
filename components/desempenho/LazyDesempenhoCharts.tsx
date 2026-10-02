"use client";

import dynamic from "next/dynamic";
import type { Desempenho } from "@/lib/desempenho";

const DesempenhoCharts = dynamic(() => import("./DesempenhoCharts").then((m) => m.DesempenhoCharts), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-xl border border-black/5 bg-surface" />,
});

export function LazyDesempenhoCharts({ d }: { d: Desempenho }) {
  return <DesempenhoCharts d={d} />;
}

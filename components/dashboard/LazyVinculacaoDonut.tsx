"use client";

import dynamic from "next/dynamic";

const VinculacaoDonut = dynamic(() => import("./VinculacaoDonut").then((m) => m.VinculacaoDonut), {
  ssr: false,
  loading: () => <div className="h-[26rem] animate-pulse rounded-xl border border-black/5 bg-surface" />,
});

export function LazyVinculacaoDonut(props: { vinculadas: number; pendentes: number; semNumero: number }) {
  return <VinculacaoDonut {...props} />;
}

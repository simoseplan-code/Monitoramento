"use client";

import dynamic from "next/dynamic";

// A biblioteca de gráficos (recharts) é pesada e só serve pra essas
// duas visualizações — carrega em separado (chunk próprio), depois dos
// cards de KPI, em vez de entrar no JS inicial do dashboard inteiro.
const VinculacaoDonut = dynamic(() => import("./VinculacaoDonut").then((m) => m.VinculacaoDonut), {
  ssr: false,
  loading: () => <div className="h-[26rem] animate-pulse rounded-xl border border-black/5 bg-surface" />,
});

const HistoricoChart = dynamic(() => import("./HistoricoChart").then((m) => m.HistoricoChart), {
  ssr: false,
  loading: () => <div className="h-[22rem] animate-pulse rounded-xl border border-black/5 bg-surface" />,
});

type Ponto = { data: string; total: number; vinculadas: number; pendentes: number };

export function DashboardCharts({
  vinculadas,
  pendentes,
  semNumero,
  pontosHistorico,
}: {
  vinculadas: number;
  pendentes: number;
  semNumero: number;
  pontosHistorico: Ponto[];
}) {
  return (
    <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <VinculacaoDonut vinculadas={vinculadas} pendentes={pendentes} semNumero={semNumero} />
      </div>
      <div className="lg:col-span-2">
        <HistoricoChart pontos={pontosHistorico} />
      </div>
    </section>
  );
}

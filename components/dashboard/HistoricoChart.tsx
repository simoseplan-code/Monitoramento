"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Ponto = { data: string; total: number; vinculadas: number; pendentes: number };

const SERIES = [
  { chave: "total", nome: "Total", cor: "var(--series-1)" },
  { chave: "vinculadas", nome: "Vinculadas", cor: "var(--status-good)" },
  { chave: "pendentes", nome: "Pendentes", cor: "var(--status-warning)" },
] as const;

export function HistoricoChart({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length < 2) {
    return (
      <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
        <h3 className="text-sm font-semibold text-ink-primary">Evolução da vinculação</h3>
        <p className="text-xs text-ink-muted">Total, vinculadas e pendentes ao longo do tempo</p>
        <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
          Ainda não há histórico suficiente — volte depois de algumas sincronizações do SIMO.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink-primary">Evolução da vinculação</h3>
      <p className="mb-2 text-xs text-ink-muted">Total, vinculadas e pendentes ao longo do tempo</p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--baseline)" }}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid rgba(11,11,11,0.08)",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(11,11,11,0.08)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
              iconType="circle"
              iconSize={8}
            />
            {SERIES.map((s) => (
              <Area
                key={s.chave}
                type="monotone"
                dataKey={s.chave}
                name={s.nome}
                stroke={s.cor}
                strokeWidth={2}
                fill={s.cor}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

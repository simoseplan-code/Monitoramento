"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AjudaCard } from "@/components/AjudaCard";

type Fatia = { chave: string; nome: string; valor: number; cor: string };

export function VinculacaoDonut({
  vinculadas,
  pendentes,
  semNumero,
}: {
  vinculadas: number;
  pendentes: number;
  semNumero: number;
}) {
  const total = vinculadas + pendentes + semNumero;

  const dados: Fatia[] = [
    { chave: "vinculada", nome: "Vinculadas", valor: vinculadas, cor: "var(--status-good)" },
    { chave: "pendente", nome: "Pendentes", valor: pendentes, cor: "var(--status-warning)" },
    { chave: "sem_numero", nome: "Sem número", valor: semNumero, cor: "var(--status-neutral)" },
  ].filter((f) => f.valor > 0);

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Visão geral da vinculação</h3>
          <p className="text-xs text-ink-muted">Distribuição das ações por status</p>
        </div>
        <AjudaCard texto="Mostra como as ações criadas de 2023 em diante se dividem por situação de vinculação: Vinculadas, Pendentes e Sem número. O número no centro é o total dessas ações." />
      </div>

      <div className="relative mx-auto h-64 w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={dados.length > 1 ? 3 : 0}
              stroke="var(--surface-1)"
              strokeWidth={2}
            >
              {dados.map((f) => (
                <Cell key={f.chave} fill={f.cor} />
              ))}
            </Pie>
            <Tooltip
              formatter={(valor, nome) => [`${valor} ações`, nome]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid rgba(11,11,11,0.08)",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(11,11,11,0.08)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-ink-primary">{total}</span>
          <span className="text-xs text-ink-muted">total</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {dados.map((f) => (
          <div key={f.chave} className="flex items-center gap-2 text-xs text-ink-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.cor }} />
            {f.nome} <span className="tabular font-medium text-ink-primary">{f.valor}</span>
          </div>
        ))}
        {dados.length === 0 && <p className="text-xs text-ink-muted">Sem dados sincronizados ainda.</p>}
      </div>
    </div>
  );
}

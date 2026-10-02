"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MODULOS, type Desempenho } from "@/lib/desempenho";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid rgba(11,11,11,0.08)",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(11,11,11,0.08)",
};
const tick = { fontSize: 11, fill: "var(--text-muted)" };
const legenda = { fontSize: 12, color: "var(--text-secondary)" };

function Caixa({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink-primary">{titulo}</h3>
      <p className="mb-2 text-xs text-ink-muted">{subtitulo}</p>
      {children}
    </div>
  );
}

function SemDados() {
  return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Sem registros nesse período.</div>;
}

export function DesempenhoCharts({ d }: { d: Desempenho }) {
  const unidade = d.agrupamento === "semana" ? "por semana (início na segunda)" : "por dia";
  const temDados = d.totalProdutivo > 0;
  const modulosComDado = MODULOS.filter((m) => d.porModulo.find((x) => x.chave === m.chave)!.total > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Caixa titulo="Divisão por tela" subtitulo="Onde o tempo da equipe foi gasto">
        {temDados ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modulosComDado.map((m) => ({ nome: m.nome, valor: d.porModulo.find((x) => x.chave === m.chave)!.total, cor: m.cor }))}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                >
                  {modulosComDado.map((m) => (
                    <Cell key={m.chave} fill={m.cor} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={legenda} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <SemDados />
        )}
      </Caixa>

      <div>
        <Caixa titulo="Dia da semana" subtitulo="Em quais dias a equipe mais produz">
          {temDados ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.porDiaSemana} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--gridline)" vertical={false} />
                  <XAxis dataKey="dia" tick={tick} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
                  <Bar dataKey="total" name="Análises" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <SemDados />
          )}
        </Caixa>
      </div>
    </div>
  );
}

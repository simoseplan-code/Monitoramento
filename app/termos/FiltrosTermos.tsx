"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

const ABAS = [
  { valor: "pendente", rotulo: "Aguardando conferência", ativa: "bg-series-1 text-white" },
  { valor: "corrigido", rotulo: "Corrigido", ativa: "bg-status-good text-white" },
  { valor: "problema", rotulo: "Com problema", ativa: "bg-status-warning text-white" },
] as const;

type Atuais = { status: string; tipo: string; orgao: string; de: string; ate: string; busca: string };

export function FiltrosTermos({
  atuais,
  contagens,
  orgaos,
}: {
  atuais: Atuais;
  contagens: { pendente: number; corrigido: number; problema: number };
  orgaos: string[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(atuais.busca);

  function aplicar(mudancas: Partial<Atuais>) {
    const v = { ...atuais, busca, ...mudancas };
    const params = new URLSearchParams();
    if (v.status !== "pendente") params.set("status", v.status);
    if (v.tipo) params.set("tipo", v.tipo);
    if (v.orgao) params.set("orgao", v.orgao);
    if (v.de) params.set("de", v.de);
    if (v.ate) params.set("ate", v.ate);
    if (v.busca) params.set("busca", v.busca);
    router.push(`/termos${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const campo =
    "rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none";

  return (
    <div className="space-y-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            onClick={() => aplicar({ status: a.valor })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              atuais.status === a.valor ? a.ativa : "border border-black/10 text-ink-secondary hover:bg-plane"
            }`}
          >
            {a.rotulo} <span className="tabular opacity-80">({contagens[a.valor]})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); aplicar({}); }} className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou ID..."
            className={`${campo} w-64 pl-9`}
          />
        </form>

        <select value={atuais.tipo} onChange={(e) => aplicar({ tipo: e.target.value })} className={campo}>
          <option value="">Os dois termos</option>
          <option value="tei">Termo de Encerramento por Inatividade (TEI)</option>
          <option value="rescisao">Termo de Rescisão</option>
        </select>

        <select value={atuais.orgao} onChange={(e) => aplicar({ orgao: e.target.value })} className={campo}>
          <option value="">Todos os órgãos</option>
          {orgaos.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Receb. definitivo de
          <input type="date" value={atuais.de} onChange={(e) => aplicar({ de: e.target.value })} className={campo} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          até
          <input type="date" value={atuais.ate} onChange={(e) => aplicar({ ate: e.target.value })} className={campo} />
        </label>
        {(atuais.de || atuais.ate) && (
          <button onClick={() => aplicar({ de: "", ate: "" })} className="text-xs text-series-1 hover:underline">
            limpar datas
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

const ANO_MINIMO_PADRAO = "2023";

export function FiltrosUnidadeQuantidade({
  buscaAtual,
  orgaoAtual,
  confiancaAtual,
  orgaos,
  statusAtual,
  anoMinAtual,
  anos,
}: {
  buscaAtual: string;
  orgaoAtual: string;
  confiancaAtual: string;
  orgaos: string[];
  statusAtual: string;
  anoMinAtual: string;
  anos: number[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaAtual);

  function aplicar(overrides: { busca?: string; orgao?: string; confianca?: string; status?: string; anoMin?: string }) {
    const params = new URLSearchParams();
    const buscaValor = overrides.busca ?? busca;
    const orgaoValor = overrides.orgao ?? orgaoAtual;
    const confiancaValor = overrides.confianca ?? confiancaAtual;
    const statusValor = overrides.status ?? statusAtual;
    const anoMinValor = overrides.anoMin ?? anoMinAtual;
    if (buscaValor) params.set("busca", buscaValor);
    if (orgaoValor) params.set("orgao", orgaoValor);
    if (confiancaValor) params.set("confianca", confiancaValor);
    if (statusValor !== "pendentes") params.set("status", statusValor);
    if (anoMinValor !== ANO_MINIMO_PADRAO) params.set("anoMin", anoMinValor);
    router.push(`/unidade-quantidade${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <form onSubmit={(e) => { e.preventDefault(); aplicar({}); }} className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, ID ou órgão..."
          className="w-full rounded-lg border border-black/10 bg-plane py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none focus:ring-2 focus:ring-series-1/20 sm:w-64"
        />
      </form>

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

      <select
        value={confiancaAtual}
        onChange={(e) => aplicar({ confianca: e.target.value })}
        className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
      >
        <option value="">Qualquer confiança</option>
        <option value="alta">Confiança alta</option>
        <option value="baixa">Confiança baixa</option>
      </select>

      <select
        value={anoMinAtual}
        onChange={(e) => aplicar({ anoMin: e.target.value })}
        className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
        title="Só ações criadas a partir desse ano — escolha 'Todos os anos' pra ver o histórico completo"
      >
        <option value="todos">Todos os anos</option>
        {anos.map((a) => (
          <option key={a} value={a}>
            De {a} em diante
          </option>
        ))}
      </select>

      <select
        value={statusAtual}
        onChange={(e) => aplicar({ status: e.target.value })}
        className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
      >
        <option value="pendentes">Aguardando revisão</option>
        <option value="aprovadas">Aprovadas, aguardando gravação</option>
        <option value="aplicadas">Já aplicadas no SIMO</option>
        <option value="todas">Todas</option>
      </select>
    </div>
  );
}

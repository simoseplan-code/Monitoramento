"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const ABAS = [
  { valor: "pendente", rotulo: "Aguardando revisão", ativa: "bg-series-1 text-white" },
  { valor: "ok", rotulo: "Sem problema", ativa: "bg-status-good text-white" },
  { valor: "problema", rotulo: "Com problema", ativa: "bg-status-warning text-white" },
] as const;

export function FiltrosSobreposicoes({
  statusAtual,
  contagens,
  orgaoAtual,
  orgaos,
  anoAtual,
  anos,
}: {
  statusAtual: string;
  contagens: { pendente: number; ok: number; problema: number };
  orgaoAtual: string;
  orgaos: string[];
  anoAtual: string;
  anos: number[];
}) {
  const router = useRouter();

  // Os botões de status são links de verdade (href) pra o botão direito oferecer
  // "abrir em nova aba"; os selects continuam navegando por aplicar().
  function hrefPara(overrides: { status?: string; orgao?: string; ano?: string }): string {
    const params = new URLSearchParams();
    const statusValor = overrides.status ?? statusAtual;
    const orgaoValor = overrides.orgao ?? orgaoAtual;
    const anoValor = overrides.ano ?? anoAtual;
    if (statusValor !== "pendente") params.set("status", statusValor);
    if (orgaoValor) params.set("orgao", orgaoValor);
    if (anoValor) params.set("ano", anoValor);
    return `/sobreposicoes${params.toString() ? `?${params.toString()}` : ""}`;
  }

  function aplicar(overrides: { status?: string; orgao?: string; ano?: string }) {
    router.push(hrefPara(overrides));
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => {
          const ativa = statusAtual === a.valor;
          return (
            <Link
              key={a.valor}
              href={hrefPara({ status: a.valor })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                ativa ? a.ativa : "border border-black/10 text-ink-secondary hover:bg-plane"
              }`}
            >
              {a.rotulo} <span className="tabular opacity-80">({contagens[a.valor]})</span>
            </Link>
          );
        })}
      </div>

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
        value={anoAtual}
        onChange={(e) => aplicar({ ano: e.target.value })}
        className="rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
        title="Local aparece se pelo menos uma das obras envolvidas foi criada nesse ano"
      >
        <option value="">Qualquer ano de criação</option>
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const BTN = "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium";
const BTN_ATIVO = "text-ink-secondary hover:bg-plane";
const BTN_DESATIVADO = "pointer-events-none text-ink-muted opacity-40";

// Paginação compartilhada por toda a listagem paginada do app (Ações,
// Novas Ações, Sobreposições, Unidade/Quantidade, Vinculação SIAFE) —
// evita repetir a mesma função montarHref/Link cinco vezes. `params` é
// o conjunto de filtros atuais da página (busca, orgão, etc.), sem a
// própria página — o componente cuida de acrescentar "pagina" no link.
export function Paginacao({
  paginaAtual,
  totalPaginas,
  baseHref,
  params = {},
}: {
  paginaAtual: number;
  totalPaginas: number;
  baseHref: string;
  params?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(String(paginaAtual));

  if (totalPaginas <= 1) return null;

  function montarHref(pagina: number) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([chave, v]) => {
      if (v) sp.set(chave, v);
    });
    if (pagina > 1) sp.set("pagina", String(pagina));
    const qs = sp.toString();
    return `${baseHref}${qs ? `?${qs}` : ""}`;
  }

  function irParaPagina(e: FormEvent) {
    e.preventDefault();
    const n = Math.min(totalPaginas, Math.max(1, parseInt(valor, 10) || 1));
    router.push(montarHref(n));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-1">
        <Link href={montarHref(1)} aria-disabled={paginaAtual === 1} className={`${BTN} ${paginaAtual === 1 ? BTN_DESATIVADO : BTN_ATIVO}`} title="Primeira página">
          <ChevronsLeft size={14} />
        </Link>
        <Link
          href={montarHref(Math.max(1, paginaAtual - 1))}
          aria-disabled={paginaAtual === 1}
          className={`${BTN} ${paginaAtual === 1 ? BTN_DESATIVADO : BTN_ATIVO}`}
        >
          <ChevronLeft size={14} /> Anterior
        </Link>
      </div>

      <form onSubmit={irParaPagina} className="flex items-center gap-1.5 text-xs text-ink-muted">
        Página
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          className="w-12 rounded-lg border border-black/10 bg-plane px-1.5 py-1 text-center text-ink-primary focus:border-series-1 focus:outline-none"
        />
        de {totalPaginas}
        <button type="submit" className="rounded-lg border border-black/10 px-2 py-1 text-ink-secondary hover:bg-plane">
          Ir
        </button>
      </form>

      <div className="flex items-center gap-1">
        <Link
          href={montarHref(Math.min(totalPaginas, paginaAtual + 1))}
          aria-disabled={paginaAtual === totalPaginas}
          className={`${BTN} ${paginaAtual === totalPaginas ? BTN_DESATIVADO : BTN_ATIVO}`}
        >
          Próxima <ChevronRight size={14} />
        </Link>
        <Link
          href={montarHref(totalPaginas)}
          aria-disabled={paginaAtual === totalPaginas}
          className={`${BTN} ${paginaAtual === totalPaginas ? BTN_DESATIVADO : BTN_ATIVO}`}
          title="Última página"
        >
          <ChevronsRight size={14} />
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function montarHref(pagina: number, busca: string, filtro: string) {
  const params = new URLSearchParams();
  if (busca) params.set("busca", busca);
  if (filtro) params.set("filtro", filtro);
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return `/acoes${qs ? `?${qs}` : ""}`;
}

export function Paginacao({
  paginaAtual,
  totalPaginas,
  busca,
  filtro,
}: {
  paginaAtual: number;
  totalPaginas: number;
  busca: string;
  filtro: string;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-black/5 px-4 py-3">
      <Link
        href={montarHref(Math.max(1, paginaAtual - 1), busca, filtro)}
        aria-disabled={paginaAtual === 1}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
          paginaAtual === 1 ? "pointer-events-none text-ink-muted opacity-50" : "text-ink-secondary hover:bg-plane"
        }`}
      >
        <ChevronLeft size={14} /> Anterior
      </Link>

      <span className="tabular text-xs text-ink-muted">
        Página {paginaAtual} de {totalPaginas}
      </span>

      <Link
        href={montarHref(Math.min(totalPaginas, paginaAtual + 1), busca, filtro)}
        aria-disabled={paginaAtual === totalPaginas}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
          paginaAtual === totalPaginas ? "pointer-events-none text-ink-muted opacity-50" : "text-ink-secondary hover:bg-plane"
        }`}
      >
        Próxima <ChevronRight size={14} />
      </Link>
    </div>
  );
}

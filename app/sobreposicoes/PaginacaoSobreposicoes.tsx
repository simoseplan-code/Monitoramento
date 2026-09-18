import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function montarHref(pagina: number, revisadas: boolean, orgao: string) {
  const params = new URLSearchParams();
  if (revisadas) params.set("revisadas", "1");
  if (orgao) params.set("orgao", orgao);
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return `/sobreposicoes${qs ? `?${qs}` : ""}`;
}

export function PaginacaoSobreposicoes({
  paginaAtual,
  totalPaginas,
  revisadas,
  orgao,
}: {
  paginaAtual: number;
  totalPaginas: number;
  revisadas: boolean;
  orgao: string;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-black/5 bg-surface px-4 py-3 shadow-card">
      <Link
        href={montarHref(Math.max(1, paginaAtual - 1), revisadas, orgao)}
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
        href={montarHref(Math.min(totalPaginas, paginaAtual + 1), revisadas, orgao)}
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

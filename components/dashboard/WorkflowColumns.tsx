import { AjudaCard } from "@/components/AjudaCard";
type Coluna = {
  chave: string;
  titulo: string;
  valor: number;
  total: number;
  cor: string;
  corFundo: string;
  ajuda: string;
};

export function WorkflowColumns({ colunas }: { colunas: Coluna[] }) {
  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Status das ações</h3>
          <p className="text-xs text-ink-muted">Situação de cada ação no SIMO — só as criadas de 2023 em diante</p>
        </div>
        <AjudaCard texto="Mostra quantas ações existem em cada status do SIMO (Em desenvolvimento, Concluído, Cancelado, etc.), só as criadas de 2023 em diante e a porcentagem sobre o total." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {colunas.map((c) => {
          const pct = c.total > 0 ? Math.round((c.valor / c.total) * 100) : 0;
          return (
            <div key={c.chave} className="rounded-lg border border-black/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: c.corFundo, color: c.cor }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.cor }} />
                  {c.titulo}
                </span>
                <AjudaCard texto={c.ajuda} />
              </div>

              <p className="tabular mt-3 text-2xl font-semibold text-ink-primary">{c.valor}</p>

              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-plane">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.cor }} />
                </div>
                <span className="tabular text-[11px] font-medium text-ink-muted">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

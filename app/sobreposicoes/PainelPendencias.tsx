import Link from "next/link";
import { AlertTriangle, BadgeCheck, FileSpreadsheet, FileText } from "lucide-react";
import { hrefSobre, type FiltrosSobre } from "@/lib/sobreposicoes/filtros";

export type LinhaPainel = { tipo: "total" | "orgao"; orgao: string | null; pares: number | string; metros: number | string };

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");

// Topo da aba Pendências: resumo dos pares com problema, ranking por órgão (clique filtra) e os relatórios.
export function PainelPendencias({ filtros, linhas }: { filtros: FiltrosSobre; linhas: LinhaPainel[] }) {
  const aguardando = filtros.status === "problema";
  const total = linhas.find((l) => l.tipo === "total");
  const pares = Number(total?.pares ?? 0);
  const metros = Number(total?.metros ?? 0);
  const orgaos = linhas
    .filter((l) => l.tipo === "orgao" && l.orgao)
    .map((l) => ({ orgao: l.orgao as string, pares: Number(l.pares), metros: Number(l.metros) }))
    .sort((a, b) => b.pares - a.pares || b.metros - a.metros);
  const maximo = Math.max(1, ...orgaos.map((o) => o.pares));

  // Os relatórios seguem o filtro de órgão da tela (vazio = todos).
  const qsOrgao = filtros.orgaos.length ? `orgao=${encodeURIComponent(filtros.orgaos.join("|"))}` : "";
  const hrefExcel = `/api/relatorios?tipo=sobreposicoes_problemas${qsOrgao ? `&${qsOrgao}` : ""}`;
  const hrefPdf = `/api/relatorios/sobreposicoes-problemas${qsOrgao ? `?${qsOrgao}` : ""}`;

  return (
    <section className={`mb-4 overflow-hidden rounded-xl border bg-surface shadow-card ${aguardando ? "border-status-warning/30" : "border-series-7/30"}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${aguardando ? "bg-status-warning-bg" : "bg-series-7/5"}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${aguardando ? "bg-status-warning" : "bg-series-7"}`}>
            {aguardando ? <AlertTriangle size={18} /> : <BadgeCheck size={18} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-primary">{aguardando ? "Pendências de sobreposição" : "Pendências já solucionadas"}</p>
            <p className="text-xs text-ink-muted">
              {aguardando
                ? "Pares de obras marcados COM PROBLEMA, aguardando solução. Quando resolver, clique em Solucionado no cartão."
                : "Pares que tinham problema e foram marcados como solucionados."}
            </p>
          </div>
        </div>
        {aguardando && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-muted">{filtros.orgaos.length ? `Relatório do filtro de órgão (${filtros.orgaos.length})` : "Relatório de todas as pendências"}</span>
            <a href={hrefExcel} className="inline-flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90">
              <FileSpreadsheet size={14} /> Excel
            </a>
            <a href={hrefPdf} className="inline-flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90">
              <FileText size={14} /> PDF
            </a>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,260px)_1fr]">
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {[
            { rotulo: aguardando ? "Pares com problema" : "Pares solucionados", valor: inteiro(pares), cor: aguardando ? "text-status-warning" : "text-series-7" },
            { rotulo: "Metros sobrepostos", valor: `${inteiro(metros)} m`, cor: "text-ink-primary" },
            { rotulo: "Órgãos envolvidos", valor: inteiro(orgaos.length), cor: "text-ink-primary" },
          ].map((k) => (
            <div key={k.rotulo} className="rounded-lg border border-black/5 bg-plane px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{k.rotulo}</p>
              <p className={`tabular text-xl font-bold ${k.cor}`}>{k.valor}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-primary">Por órgão</p>
            <p className="text-[10px] text-ink-muted">Um par conta para cada órgão envolvido · clique para filtrar</p>
          </div>
          {orgaos.length === 0 ? (
            <p className="rounded-lg bg-plane px-3 py-4 text-center text-xs text-ink-muted">{aguardando ? "Nenhuma pendência com esses filtros. 🎉" : "Nenhum par solucionado com esses filtros."}</p>
          ) : (
            <ul className="grid max-h-60 gap-x-4 gap-y-1 overflow-y-auto pr-1 md:grid-cols-2 [scrollbar-width:thin]">
              {orgaos.map((o) => {
                const ativo = filtros.orgaos.length === 1 && filtros.orgaos[0] === o.orgao;
                return (
                  <li key={o.orgao}>
                    <Link
                      href={hrefSobre({ ...filtros, orgaos: ativo ? [] : [o.orgao] })}
                      className={`block rounded-lg px-2.5 py-1.5 transition-colors ${ativo ? "bg-series-1/10 ring-1 ring-series-1/40" : "hover:bg-plane"}`}
                      title={ativo ? "Tirar o filtro deste órgão" : `Filtrar pelo órgão ${o.orgao}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-ink-primary">{o.orgao}</span>
                        <span className="tabular shrink-0 text-ink-secondary">
                          <strong>{o.pares}</strong> par(es) · {inteiro(o.metros)} m
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                        <div className={`h-full rounded-full ${aguardando ? "bg-status-warning" : "bg-series-7"}`} style={{ width: `${Math.max(4, (o.pares / maximo) * 100)}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

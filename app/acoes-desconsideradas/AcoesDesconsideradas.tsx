"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Search, X } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { useDesconsideradas, type Desconsiderada } from "@/components/DesconsiderarIds";
import { TELAS_DESCONSIDERADAS, type ChaveTela } from "@/lib/desconsideradasTelas";
import { lerIds } from "@/lib/acoesFiltro";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

export function AcoesDesconsideradas({ listas, ehAdmin, maes = {} }: { listas: Record<string, Desconsiderada[]>; ehAdmin: boolean; maes?: Record<string, string> }) {
  const [aba, setAba] = useState<ChaveTela>("todas");
  const [qtds, setQtds] = useState<Record<string, number>>(() => Object.fromEntries(TELAS_DESCONSIDERADAS.map((t) => [t.chave, (listas[t.chave] ?? []).length])));

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        IDs que a equipe tirou das análises. Cada aba é a lista de uma análise; a aba <strong className="text-ink-secondary">Todas as análises</strong> tira o ID de todas elas de uma vez. As listas valem para todas as pessoas.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {TELAS_DESCONSIDERADAS.map((t) => (
          <button
            key={t.chave}
            onClick={() => setAba(t.chave)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${aba === t.chave ? "bg-series-1 text-white" : "bg-surface text-ink-secondary shadow-card hover:bg-plane"}`}
          >
            {t.rotulo}
            <span className={`tabular rounded-full px-1.5 text-[10px] font-semibold ${aba === t.chave ? "bg-white/25" : "bg-plane text-ink-muted"}`}>{inteiro(qtds[t.chave] ?? 0)}</span>
          </button>
        ))}
      </div>

      {/* Todas as abas ficam montadas (cada uma guarda a própria lista); só a escolhida aparece. */}
      {TELAS_DESCONSIDERADAS.map((t) => (
        <div key={t.chave} hidden={aba !== t.chave}>
          <ListaDeUmaAnalise
            tela={t.chave}
            ajuda={t.ajuda}
            somenteLeitura={t.restrita && !ehAdmin}
            inicial={listas[t.chave] ?? []}
            maes={maes}
            aoContar={(n) => setQtds((q) => (q[t.chave] === n ? q : { ...q, [t.chave]: n }))}
          />
        </div>
      ))}
    </div>
  );
}

function ListaDeUmaAnalise({
  tela,
  ajuda,
  somenteLeitura,
  inicial,
  maes,
  aoContar,
}: {
  tela: ChaveTela;
  ajuda: string;
  somenteLeitura: boolean;
  inicial: Desconsiderada[];
  maes: Record<string, string>;
  aoContar: (n: number) => void;
}) {
  const { desc, ocupado, erro, mudar } = useDesconsideradas(tela, inicial);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  // Na lista "Todas": ver tudo, só o que a equipe pôs, ou só as ações filhas (entram sozinhas).
  const [origem, setOrigem] = useState<"todas" | "manual" | "filha">("todas");
  const qtdFilhas = desc.filter((d) => d.origem === "filha").length;
  const qtdManuais = desc.length - qtdFilhas;

  useEffect(() => aoContar(desc.length), [desc.length, aoContar]);

  const novos = lerIds(texto);
  const jaTem = useMemo(() => new Set(desc.map((d) => d.id)), [desc]);
  const aAdicionar = novos.filter((i) => !jaTem.has(i));
  const termo = busca.trim().toLowerCase();
  const porOrigem = origem === "todas" ? desc : desc.filter((d) => (d.origem === "filha" ? "filha" : "manual") === origem);
  const filtradas = termo ? porOrigem.filter((d) => d.id.includes(termo) || (d.nome ?? "").toLowerCase().includes(termo) || (d.orgao ?? "").toLowerCase().includes(termo)) : porOrigem;

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <p className="text-xs text-ink-muted">{ajuda}</p>

      {tela === "todas" && qtdFilhas > 0 && (
        <div className="rounded-lg border border-series-1/20 bg-series-1/5 p-3 text-xs text-ink-secondary">
          <p>
            <strong className="text-ink-primary">{inteiro(qtdFilhas)} ação(ões) filha(s)</strong> da Configuração de TD estão nesta lista sozinhas: toda ação filha sai de todas as análises (inclusive da Vinculação SIAFE) e só a mãe continua. Elas aparecem marcadas
            como <span className="rounded-full bg-series-1/10 px-1.5 py-0.5 font-semibold text-series-1">Ação filha</span>, com a mãe indicada, e não dá para devolvê-las aqui: para isso é preciso remover a filha na Configuração de TD.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["todas", `Todas (${inteiro(desc.length)})`],
                ["manual", `Desconsideradas pela equipe (${inteiro(qtdManuais)})`],
                ["filha", `Ações filhas (${inteiro(qtdFilhas)})`],
              ] as const
            ).map(([chave, rotulo]) => (
              <button key={chave} onClick={() => setOrigem(chave)} className={`rounded-full px-3 py-1 text-[11px] font-medium ${origem === chave ? "bg-series-1 text-white" : "bg-surface text-ink-secondary shadow-card hover:bg-plane"}`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {somenteLeitura ? (
        <p className="rounded-lg bg-plane px-3 py-2 text-xs text-ink-muted">Esta lista só é alterada por admin e chefe; todos podem ver.</p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Cole os IDs que devem sair desta análise (vírgula, espaço ou linha)"
            className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 font-mono text-xs text-ink-primary focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                if (await mudar("adicionar", aAdicionar)) setTexto("");
              }}
              disabled={ocupado || aAdicionar.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {ocupado && <Loader2 size={13} className="animate-spin" />}
              {aAdicionar.length > 0 ? `Desconsiderar ${inteiro(aAdicionar.length)} ID(s)` : "Desconsiderar"}
            </button>
            {novos.length > 0 && aAdicionar.length < novos.length && <span className="text-xs text-ink-muted">{inteiro(novos.length - aAdicionar.length)} já estava(m) na lista.</span>}
            {qtdManuais > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(`Devolver os ${qtdManuais} IDs desta lista para a análise? Vale para a equipe toda.${qtdFilhas > 0 ? ` As ${qtdFilhas} ações filhas continuam fora (só saem pela Configuração de TD).` : ""}`)) void mudar("devolver_todos");
                }}
                disabled={ocupado}
                className="ml-auto text-xs font-medium text-ink-muted hover:text-ink-primary hover:underline disabled:opacity-50"
              >
                Devolver todos
              </button>
            )}
          </div>
        </div>
      )}
      {erro && <p className="text-xs font-medium text-status-critical">{erro}</p>}

      {desc.length > 0 && (
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nesta lista (ID, nome ou órgão)..." className={campo + " w-full pl-9 sm:w-80"} />
        </label>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/5">
        <table className="w-full text-sm">
          <thead className="bg-plane text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Nome da ação</th>
              <th className="px-4 py-2.5">Órgão</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Desconsiderada por</th>
              {!somenteLeitura && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((d) => (
              <tr key={d.id} className="border-t border-black/5">
                <td className="tabular px-4 py-2 font-medium text-ink-primary">
                  <IdAcaoLink id={d.id} />
                  {d.origem === "filha" && (
                    <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-series-1/10 px-2 py-0.5 text-[10px] font-semibold text-series-1" title="Entrou sozinha por ser ação filha na Configuração de TD">
                      Ação filha{maes[d.id] ? <> de <IdAcaoLink id={maes[d.id]} /></> : null}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-secondary">{d.nome ?? <span className="text-ink-muted">ID não encontrado na base</span>}</td>
                <td className="px-4 py-2 text-ink-secondary">{d.orgao ?? "-"}</td>
                <td className="px-4 py-2 text-ink-secondary">{d.status ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-ink-muted">
                  {d.por ?? "-"} · {new Date(d.em).toLocaleDateString("pt-BR")}
                </td>
                {!somenteLeitura && (
                  <td className="px-4 py-2 text-right">
                    {d.origem === "filha" ? (
                      <span title="É ação filha na Configuração de TD: para devolver, remova a filha lá" className="inline-flex p-1 text-ink-muted">
                        <Lock size={14} />
                      </span>
                    ) : (
                      <button onClick={() => void mudar("devolver", [d.id])} disabled={ocupado} title="Devolver para a análise" className="rounded-full p-1 text-ink-muted hover:bg-plane hover:text-status-critical disabled:opacity-50">
                        <X size={14} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={somenteLeitura ? 5 : 6} className="px-4 py-8 text-center text-sm text-ink-muted">
                  {desc.length === 0 ? "Nenhum ID desconsiderado nesta lista." : "Nada encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

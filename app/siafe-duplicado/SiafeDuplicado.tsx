"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { dataBR } from "@/lib/acoesFiltro";

export type AcaoDoGrupo = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  /** Número digitado à mão no SIMO (campo de escrita). */
  siafeEscrito: string | null;
  /** Número automático do SIAFE (o que vincula a ação). */
  siafeAutomatico: string | null;
  criadaEm: string | null;
  /** Já está na lista "Todas as análises" (Ações desconsideradas). */
  desconsiderada: boolean;
};
export type GrupoSiafe = { siafe: string; acoes: AcaoDoGrupo[] };

type Aba = "geral" | "automatico" | "escrito";

const TAMANHO = 50;
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function SiafeDuplicado({ automatico, escrito }: { automatico: GrupoSiafe[]; escrito: GrupoSiafe[] }) {
  const [aba, setAba] = useState<Aba>("geral");
  // Ao clicar num número da visão geral, a aba do campo abre já nele.
  const [foco, setFoco] = useState<string>("");

  const abas: { chave: Aba; rotulo: string; qtd?: number }[] = [
    { chave: "geral", rotulo: "Visão geral" },
    { chave: "automatico", rotulo: "SIAFE automático", qtd: automatico.length },
    { chave: "escrito", rotulo: "SIAFE escrito", qtd: escrito.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {abas.map((a) => (
          <button
            key={a.chave}
            onClick={() => {
              setFoco("");
              setAba(a.chave);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${aba === a.chave ? "bg-series-1 text-white" : "bg-surface text-ink-secondary shadow-card hover:bg-plane"}`}
          >
            {a.rotulo}
            {a.qtd !== undefined && <span className={`tabular rounded-full px-1.5 text-[10px] font-semibold ${aba === a.chave ? "bg-white/25" : "bg-plane text-ink-muted"}`}>{inteiro(a.qtd)}</span>}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        <VisaoGeral
          automatico={automatico}
          escrito={escrito}
          aoAbrir={(qual, numero) => {
            setFoco(numero);
            setAba(qual);
          }}
        />
      )}
      {aba === "automatico" && (
        <ListaDeGrupos
          key={"a" + foco}
          grupos={automatico}
          rotulo="SIAFE automático"
          explica="O número automático é o que vincula a ação ao SIAFE. Cada linha é um número que aparece em mais de uma ação."
          buscaInicial={foco}
          arquivo="siafe-automatico-duplicado"
        />
      )}
      {aba === "escrito" && (
        <ListaDeGrupos
          key={"e" + foco}
          grupos={escrito}
          rotulo="SIAFE escrito"
          explica="O SIAFE escrito é o campo digitado à mão no SIMO (pode ter erro de digitação). Cada linha é um número que aparece em mais de uma ação."
          buscaInicial={foco}
          arquivo="siafe-escrito-duplicado"
        />
      )}
    </div>
  );
}

// ---------- visão geral ----------

function resumoDe(grupos: GrupoSiafe[]) {
  const ids = new Set(grupos.flatMap((g) => g.acoes.map((a) => a.id)));
  const maior = grupos[0] ?? null; // já vem ordenado: o maior primeiro
  const desconsideradas = new Set(grupos.flatMap((g) => g.acoes.filter((a) => a.desconsiderada).map((a) => a.id))).size;
  return { numeros: grupos.length, acoes: ids.size, ids, maior, desconsideradas };
}

function VisaoGeral({ automatico, escrito, aoAbrir }: { automatico: GrupoSiafe[]; escrito: GrupoSiafe[]; aoAbrir: (qual: Aba, numero: string) => void }) {
  const a = useMemo(() => resumoDe(automatico), [automatico]);
  const e = useMemo(() => resumoDe(escrito), [escrito]);
  const nosDois = useMemo(() => Array.from(a.ids).filter((id) => e.ids.has(id)).length, [a, e]);

  const cartao = (titulo: string, r: ReturnType<typeof resumoDe>, qual: Aba, grupos: GrupoSiafe[]) => (
    <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink-primary">{titulo}</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="tabular text-2xl font-semibold text-ink-primary">{inteiro(r.numeros)}</p>
          <p className="text-[11px] text-ink-muted">números repetidos</p>
        </div>
        <div>
          <p className="tabular text-2xl font-semibold text-ink-primary">{inteiro(r.acoes)}</p>
          <p className="text-[11px] text-ink-muted">ações envolvidas</p>
        </div>
        <div>
          <p className="tabular text-2xl font-semibold text-ink-primary">{r.maior ? inteiro(r.maior.acoes.length) : 0}</p>
          <p className="text-[11px] text-ink-muted">ações no maior grupo</p>
        </div>
      </div>
      {r.desconsideradas > 0 && <p className="mt-2 text-[11px] text-ink-muted">{inteiro(r.desconsideradas)} já está(ão) desconsiderada(s).</p>}

      <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Os que mais se repetem</h3>
      {grupos.length === 0 ? (
        <p className="text-xs text-ink-muted">Nenhum número repetido.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {grupos.slice(0, 8).map((g) => {
            const orgaos = Array.from(new Set(g.acoes.map((x) => x.orgao).filter(Boolean) as string[]));
            return (
              <li key={g.siafe}>
                <button onClick={() => aoAbrir(qual, g.siafe)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-plane/60">
                  <span className="tabular text-sm font-semibold text-ink-primary">{g.siafe}</span>
                  <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-[11px] font-semibold text-status-warning">{g.acoes.length} ações</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{orgaos.slice(0, 3).join(", ")}</span>
                  <ChevronRight size={14} className="shrink-0 text-ink-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {grupos.length > 8 && (
        <button onClick={() => aoAbrir(qual, "")} className="mt-2 text-xs font-medium text-series-1 hover:underline">
          Ver todos os {inteiro(grupos.length)}
        </button>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        Apanhado do que está igual: ações que usam o <strong className="text-ink-secondary">mesmo número de SIAFE</strong>, olhando separado o <strong className="text-ink-secondary">SIAFE automático</strong> (o que vincula a ação) e o{" "}
        <strong className="text-ink-secondary">SIAFE escrito</strong> (digitado à mão no SIMO). Esta tela mostra todas as ações, inclusive as já desconsideradas (marcadas), para você escolher quais desconsiderar.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {cartao("SIAFE automático", a, "automatico", automatico)}
        {cartao("SIAFE escrito", e, "escrito", escrito)}
      </div>
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink-primary">Nos dois campos</h2>
        <p className="mt-1 text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(nosDois)}</strong> ação(ões) aparecem em um número repetido do SIAFE automático <em>e</em> em um número repetido do SIAFE escrito. Total de ações com algum número repetido:{" "}
          <strong className="text-ink-primary">{inteiro(new Set([...a.ids, ...e.ids]).size)}</strong>.
        </p>
      </section>
    </div>
  );
}

// ---------- lista de um campo ----------

function ListaDeGrupos({ grupos, rotulo, explica, buscaInicial, arquivo }: { grupos: GrupoSiafe[]; rotulo: string; explica: string; buscaInicial: string; arquivo: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [orgao, setOrgao] = useState("");
  const [status, setStatus] = useState("");
  const [ano, setAno] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set(buscaInicial ? [buscaInicial] : []));
  const [pagina, setPagina] = useState(1);

  const orgaos = useMemo(() => Array.from(new Set(grupos.flatMap((g) => g.acoes.map((a) => a.orgao).filter(Boolean) as string[]))).sort(), [grupos]);
  const statusLista = useMemo(() => Array.from(new Set(grupos.flatMap((g) => g.acoes.map((a) => a.status).filter(Boolean) as string[]))).sort(), [grupos]);

  const anos = useMemo(() => Array.from(new Set(grupos.flatMap((g) => g.acoes.map((a) => (a.criadaEm ?? "").slice(0, 4)).filter((y) => /^\d{4}$/.test(y))))).sort().reverse(), [grupos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (termo && !(g.siafe.toLowerCase().includes(termo) || g.acoes.some((a) => a.id.includes(termo) || a.nome.toLowerCase().includes(termo)))) return false;
      if (orgao && !g.acoes.some((a) => a.orgao === orgao)) return false;
      if (status && !g.acoes.some((a) => a.status === status)) return false;
      // Ano de criação: basta pelo menos uma ação do número ter sido criada nesse ano.
      if (ano && !g.acoes.some((a) => (a.criadaEm ?? "").slice(0, 4) === ano)) return false;
      return true;
    });
  }, [grupos, busca, orgao, status, ano]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * TAMANHO, paginaAtual * TAMANHO);
  const alternar = (siafe: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(siafe)) n.delete(siafe);
      else n.add(siafe);
      return n;
    });
  const todosAbertos = visiveis.length > 0 && visiveis.every((g) => abertos.has(g.siafe));

  function exportar() {
    const colunas = [rotulo, "Ações com este número", "ID da Ação", "Nome da Ação", "Órgão", "Status", "Estágio Atual", "SIAFE automático", "SIAFE escrito", "Data de Criação"];
    const linhas = filtrados.flatMap((g) => g.acoes.map((a) => [g.siafe, g.acoes.length, a.id, a.nome, a.orgao, a.status, a.estagio, a.siafeAutomatico, a.siafeEscrito, a.criadaEm].map(csvEscape).join(";")));
    const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${arquivo}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="text-xs text-ink-muted">
          {explica} Clique no número para ver as ações. Esta tela mostra todas as ações, inclusive as já desconsideradas (marcadas).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              placeholder="Nº SIAFE, ID ou nome..."
              className={campo + " w-64 pl-9"}
            />
          </label>
          <select
            value={orgao}
            onChange={(e) => {
              setOrgao(e.target.value);
              setPagina(1);
            }}
            className={campo}
          >
            <option value="">Todos os órgãos</option>
            {orgaos.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPagina(1);
            }}
            className={campo}
          >
            <option value="">Todos os status</option>
            {statusLista.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => {
              setAno(e.target.value);
              setPagina(1);
            }}
            className={campo}
            title="Mostra os números em que pelo menos uma ação foi criada no ano escolhido"
          >
            <option value="">Todos os anos de criação</option>
            {anos.map((y) => (
              <option key={y} value={y}>
                Criada em {y}
              </option>
            ))}
          </select>
          {(busca || orgao || status || ano) && (
            <button
              onClick={() => {
                setBusca("");
                setOrgao("");
                setStatus("");
                setAno("");
                setPagina(1);
              }}
              className="text-xs font-medium text-series-1 hover:underline"
            >
              limpar filtros
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAbertos(todosAbertos ? new Set() : new Set(visiveis.map((g) => g.siafe)))}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane"
            >
              {todosAbertos ? "Recolher todos" : "Expandir todos"}
            </button>
            <button onClick={exportar} disabled={filtrados.length === 0} className="flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
              <Download size={13} /> Exportar Excel
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtrados.length)}</strong> de {inteiro(grupos.length)} número(s) · {inteiro(filtrados.reduce((s, g) => s + g.acoes.length, 0))} ação(ões)
        </p>
      </section>

      <section className="space-y-2">
        {visiveis.map((g) => {
          const aberto = abertos.has(g.siafe);
          const orgaosDoGrupo = Array.from(new Set(g.acoes.map((a) => a.orgao).filter(Boolean) as string[]));
          return (
            <div key={g.siafe} className="rounded-xl border border-black/5 bg-surface shadow-card">
              <button onClick={() => alternar(g.siafe)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left" aria-expanded={aberto}>
                {aberto ? <ChevronDown size={16} className="shrink-0 text-ink-muted" /> : <ChevronRight size={16} className="shrink-0 text-ink-muted" />}
                <span className="tabular text-sm font-semibold text-ink-primary">{g.siafe}</span>
                <span className="rounded-full bg-status-warning-bg px-2.5 py-0.5 text-xs font-semibold text-status-warning">{g.acoes.length} ações</span>
                <span className="text-xs text-ink-muted">
                  {orgaosDoGrupo.slice(0, 4).join(", ")}
                  {orgaosDoGrupo.length > 4 ? ` +${orgaosDoGrupo.length - 4}` : ""}
                </span>
              </button>
              {aberto && (
                <div className="overflow-x-auto border-t border-black/5">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-4 py-2">ID</th>
                        <th className="px-4 py-2">Nome da ação</th>
                        <th className="px-4 py-2">Órgão</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Estágio</th>
                        <th className="px-4 py-2">Criada em</th>
                        <th className="px-4 py-2">SIAFE automático</th>
                        <th className="px-4 py-2">SIAFE escrito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.acoes.map((a) => (
                        <tr key={a.id} className="border-t border-black/5">
                          <td className="tabular px-4 py-2 font-medium text-ink-primary">
                            <IdAcaoLink id={a.id} />
                            {a.desconsiderada && <span className="ml-1.5 rounded-full bg-status-neutral-bg px-1.5 py-0.5 text-[10px] font-medium text-status-neutral" title="Já está na lista Todas as análises">desconsiderada</span>}
                          </td>
                          <td className="px-4 py-2 text-ink-secondary">{a.nome}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.orgao ?? "-"}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.status ?? "-"}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.estagio ?? "-"}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-ink-secondary">{dataBR(a.criadaEm)}</td>
                          <td className="tabular px-4 py-2 text-ink-secondary">{a.siafeAutomatico ?? "-"}</td>
                          <td className="tabular px-4 py-2 text-ink-secondary">{a.siafeEscrito ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {visiveis.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center text-sm text-ink-muted shadow-card">
            {grupos.length === 0 ? `Nenhum número repetido no ${rotulo}.` : "Nenhum número com esses filtros."}
          </div>
        )}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-1 pt-1 text-xs text-ink-muted">
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <span className="flex gap-2">
              <button onClick={() => setPagina(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
                Anterior
              </button>
              <button onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))} disabled={paginaAtual === totalPaginas} className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
                Próxima
              </button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

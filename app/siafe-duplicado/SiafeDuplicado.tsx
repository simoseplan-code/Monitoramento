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
  vinculada: boolean;
  criadaEm: string | null;
};
export type GrupoSiafe = { siafe: string; acoes: AcaoDoGrupo[] };

const TAMANHO = 50;
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function SiafeDuplicado({ grupos, desconsideradas }: { grupos: GrupoSiafe[]; desconsideradas: number }) {
  const [busca, setBusca] = useState("");
  const [orgao, setOrgao] = useState("");
  const [status, setStatus] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);

  const orgaos = useMemo(() => Array.from(new Set(grupos.flatMap((g) => g.acoes.map((a) => a.orgao).filter(Boolean) as string[]))).sort(), [grupos]);
  const statusLista = useMemo(() => Array.from(new Set(grupos.flatMap((g) => g.acoes.map((a) => a.status).filter(Boolean) as string[]))).sort(), [grupos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (termo && !(g.siafe.toLowerCase().includes(termo) || g.acoes.some((a) => a.id.includes(termo) || a.nome.toLowerCase().includes(termo)))) return false;
      if (orgao && !g.acoes.some((a) => a.orgao === orgao)) return false;
      if (status && !g.acoes.some((a) => a.status === status)) return false;
      return true;
    });
  }, [grupos, busca, orgao, status]);

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
    const colunas = ["Nº SIAFE", "Ações com este número", "ID da Ação", "Nome da Ação", "Órgão", "Status", "Estágio Atual", "Vinculada", "Data de Criação"];
    const linhas = filtrados.flatMap((g) => g.acoes.map((a) => [g.siafe, g.acoes.length, a.id, a.nome, a.orgao, a.status, a.estagio, a.vinculada ? "Sim" : "Não", a.criadaEm].map(csvEscape).join(";")));
    const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siafe-duplicado-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="text-xs text-ink-muted">
          Cada linha é um <strong className="text-ink-secondary">número de SIAFE</strong> que aparece em mais de uma ação. Clique no número para ver as ações que usam o mesmo contrato.
          {desconsideradas > 0 && <> {inteiro(desconsideradas)} ID(s) desconsiderado(s) pela equipe não entram aqui (menu Ações desconsideradas).</>}
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
          {(busca || orgao || status) && (
            <button
              onClick={() => {
                setBusca("");
                setOrgao("");
                setStatus("");
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
          <strong className="text-ink-primary">{inteiro(filtrados.length)}</strong> de {inteiro(grupos.length)} número(s) de SIAFE · {inteiro(filtrados.reduce((s, g) => s + g.acoes.length, 0))} ação(ões)
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
                <span className="text-xs text-ink-muted">{orgaosDoGrupo.slice(0, 4).join(", ")}{orgaosDoGrupo.length > 4 ? ` +${orgaosDoGrupo.length - 4}` : ""}</span>
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
                        <th className="px-4 py-2">Vinculada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.acoes.map((a) => (
                        <tr key={a.id} className="border-t border-black/5">
                          <td className="tabular px-4 py-2 font-medium text-ink-primary">
                            <IdAcaoLink id={a.id} />
                          </td>
                          <td className="px-4 py-2 text-ink-secondary">{a.nome}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.orgao ?? "-"}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.status ?? "-"}</td>
                          <td className="px-4 py-2 text-ink-secondary">{a.estagio ?? "-"}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-ink-secondary">{dataBR(a.criadaEm)}</td>
                          <td className="px-4 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.vinculada ? "bg-status-good-bg text-status-good" : "bg-status-neutral-bg text-status-neutral"}`}>{a.vinculada ? "Sim" : "Não"}</span>
                          </td>
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
            {grupos.length === 0 ? "Nenhum número de SIAFE repetido." : "Nenhum número com esses filtros."}
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

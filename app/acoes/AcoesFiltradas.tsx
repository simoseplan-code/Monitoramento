"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, Filter, Loader2, RotateCcw, Save, Search, X } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import {
  FILTROS,
  contagemVinculacao,
  estadoDeGravado,
  estadoPadrao,
  estadoParaGravar,
  filtrar,
  lerIds,
  siafeValido,
  valoresDosFiltros,
  vinculacao,
  type AcaoLinha,
  type EstadoFiltros,
} from "@/lib/acoesFiltro";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const TAMANHO = 100;

const BADGES: Record<string, string> = {
  Vinculada: "bg-status-good-bg text-status-good",
  Pendente: "bg-status-warning-bg text-status-warning",
  "Sem número": "bg-status-neutral-bg text-status-neutral",
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type Inicial = { busca?: string; orgao?: string; filtro?: string };

export function AcoesFiltradas({
  acoes,
  filtroGravado,
  inicial,
}: {
  acoes: AcaoLinha[];
  filtroGravado: { estado: unknown; atualizadoEm: string } | null;
  inicial: Inicial;
}) {
  const valores = useMemo(() => valoresDosFiltros(acoes), [acoes]);
  // Quem chega por um link (ex.: "Pendentes" do painel) abre já nesse filtro; senão, abre no filtro gravado.
  const [estado, setEstado] = useState<EstadoFiltros>(() => {
    const temLink = !!(inicial.busca || inicial.orgao || inicial.filtro);
    const base = !temLink && filtroGravado ? estadoDeGravado(filtroGravado.estado, valores) : estadoPadrao();
    if (!temLink) return base;
    const e = { ...base, selecao: { ...base.selecao }, busca: inicial.busca ?? "" };
    if (inicial.orgao && valores.orgao.some((v) => v.valor === inicial.orgao)) e.selecao.orgao = new Set([inicial.orgao]);
    if (inicial.filtro === "vinculada") e.selecao.vinculacao = new Set(["Vinculada"]);
    else if (inicial.filtro === "pendente") e.selecao.vinculacao = new Set(["Pendente"]);
    else if (inicial.filtro === "sem_numero") e.selecao.vinculacao = new Set(["Sem número"]);
    else if (inicial.filtro === "dado_incorreto") e.selecao.siafe = new Set(["Dado incorreto"]);
    return e;
  });
  const [painelAberto, setPainelAberto] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [gravadoEm, setGravadoEm] = useState<string | null>(filtroGravado?.atualizadoEm ?? null);
  const [gravadoJson, setGravadoJson] = useState<string | null>(filtroGravado ? JSON.stringify(estadoParaGravar(estadoDeGravado(filtroGravado.estado, valores))) : null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [exportando, setExportando] = useState<"pdf" | null>(null);
  const [menuExportar, setMenuExportar] = useState(false);
  const [erroExportar, setErroExportar] = useState<string | null>(null);

  const filtradas = useMemo(() => filtrar(acoes, estado), [acoes, estado]);
  const contagem = useMemo(() => contagemVinculacao(filtradas), [filtradas]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * TAMANHO, paginaAtual * TAMANHO);

  const jsonAtual = JSON.stringify(estadoParaGravar(estado));
  const alterado = gravadoJson !== null && gravadoJson !== jsonAtual;
  const filtrosAtivos =
    FILTROS.filter((f) => estado.selecao[f.chave] !== null).length + (estado.pctMinimo != null ? 1 : 0) + (estado.busca ? 1 : 0) + (estado.de ? 1 : 0) + (estado.ate ? 1 : 0);

  function mudar(e: EstadoFiltros) {
    setEstado(e);
    setPagina(1);
  }

  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarExcel() {
    setMenuExportar(false);
    const colunas = ["ID da Ação", "Nome da Ação", "Órgão", "Número Automático", "Número do Contrato no SIAFE", "Situação", "Status", "Estágio Atual", "Tipologia", "Classificação", "Percentual de Execução", "Ação Conveniada", "Data de Criação"];
    const linhas = filtradas.map((a) =>
      [a.id, a.nome, a.orgao, a.numeroAutomatico, a.numeroSiafe, vinculacao(a), a.status, a.estagio, a.tipologia, a.classificacao, a.pct != null ? a.pct : "", a.conveniada, a.criadaEm]
        .map(csvEscape)
        .join(";")
    );
    const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");
    baixar(new Blob([csv], { type: "text/csv;charset=utf-8" }), `acoes-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function exportarPdf() {
    setMenuExportar(false);
    setExportando("pdf");
    setErroExportar(null);
    try {
      const resp = await fetch("/api/acoes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: estadoParaGravar(estado) }),
        credentials: "same-origin",
      });
      if (!resp.ok) {
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        setErroExportar(json.error ?? "Não foi possível gerar o PDF.");
        return;
      }
      const blob = await resp.blob();
      const nome = resp.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "acoes.pdf";
      baixar(blob, nome);
    } catch {
      setErroExportar("Sem conexão com o servidor.");
    } finally {
      setExportando(null);
    }
  }

  async function gravarFiltro() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tela: "acoes", estado: estadoParaGravar(estado) }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; atualizadoEm?: string };
      if (!resp.ok) setAviso({ tipo: "erro", texto: json.error ?? "Não foi possível gravar o filtro." });
      else {
        setGravadoEm(json.atualizadoEm ?? new Date().toISOString());
        setGravadoJson(jsonAtual);
        setAviso({ tipo: "ok", texto: "Filtro gravado. Quando você voltar a esta tela, ele já estará aplicado." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  async function apagarFiltroGravado() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros?tela=acoes", { method: "DELETE" });
      if (!resp.ok) setAviso({ tipo: "erro", texto: "Não foi possível apagar o filtro gravado." });
      else {
        setGravadoEm(null);
        setGravadoJson(null);
        mudar(estadoPadrao());
        setAviso({ tipo: "ok", texto: "Filtro gravado apagado." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  // Atalho: o que a pessoa mais precisa (concluídas e não vinculadas).
  function soNaoVinculadas() {
    mudar({ ...estado, selecao: { ...estado.selecao, vinculacao: new Set(["Pendente", "Sem número"]) } });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(acoes.length)} ação(ões) · {inteiro(contagem.vinculadas)} vinculada(s) ·{" "}
          <strong className="text-status-critical">{inteiro(contagem.naoVinculadas)} não vinculada(s)</strong>
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={soNaoVinculadas} className="rounded-full border border-black/10 bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-plane" title="Marca só as ações pendentes e sem número no filtro de Vinculação">
            Só não vinculadas
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuExportar((m) => !m)}
              disabled={exportando !== null || filtradas.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              title="Baixa a lista com os filtros que estão aplicados agora"
            >
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exportando ? "Gerando..." : "Exportar"}
            </button>
            {menuExportar && (
              <div className="absolute right-0 z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-black/10 bg-surface shadow-card">
                <button onClick={exportarPdf} className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-plane">
                  <FileText size={16} className="mt-0.5 shrink-0 text-status-critical" />
                  <span>
                    <span className="block text-xs font-semibold text-ink-primary">PDF</span>
                    <span className="block text-[11px] text-ink-muted">A lista filtrada, com os filtros usados e o resumo de vinculação.</span>
                  </span>
                </button>
                <button onClick={exportarExcel} className="flex w-full items-start gap-2.5 border-t border-black/5 px-4 py-3 text-left hover:bg-plane">
                  <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-status-good" />
                  <span>
                    <span className="block text-xs font-semibold text-ink-primary">Excel (.csv)</span>
                    <span className="block text-[11px] text-ink-muted">Todas as colunas da lista filtrada.</span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setPainelAberto((a) => !a)}
            className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-plane"
          >
            <Filter size={13} /> {painelAberto ? "Esconder filtros" : "Mostrar filtros"}
            {filtrosAtivos > 0 && <span className="rounded-full bg-series-1/10 px-1.5 text-[10px] text-series-1">{filtrosAtivos}</span>}
          </button>
        </div>
      </div>

      {erroExportar && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erroExportar}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 rounded-xl border border-black/5 bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Nome da ação</th>
                  <th className="px-4 py-3">Órgão</th>
                  <th className="px-4 py-3">Nº SIAFE</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Estágio</th>
                  <th className="px-4 py-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => {
                  const st = vinculacao(r);
                  return (
                    <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
                      <td className="tabular px-4 py-3 font-medium text-ink-primary">
                        <IdAcaoLink id={r.id} />
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{r.nome}</td>
                      <td className="px-4 py-3 text-ink-secondary">{r.orgao}</td>
                      <td className={`px-4 py-3 ${r.numeroSiafe && !siafeValido(r.numeroSiafe) ? "font-medium text-status-critical" : "text-ink-secondary"}`}>{r.numeroSiafe ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-secondary">{r.status ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-secondary">{r.estagio ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[st]}`}>{st}</span>
                      </td>
                    </tr>
                  );
                })}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted">
                      Nenhuma ação encontrada com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between border-t border-black/5 px-5 py-2.5 text-xs text-ink-muted">
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

        {painelAberto && (
          <PainelFiltros
            estado={estado}
            setEstado={mudar}
            valores={valores}
            aoFechar={() => setPainelAberto(false)}
            gravacao={{ gravando, gravadoEm, alterado, aviso, aoGravar: gravarFiltro, aoApagar: apagarFiltroGravado }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- coluna de filtros (como no Excel) ----------

function PainelFiltros({
  estado,
  setEstado,
  valores,
  aoFechar,
  gravacao,
}: {
  estado: EstadoFiltros;
  setEstado: (e: EstadoFiltros) => void;
  valores: Record<string, { valor: string; qtd: number }[]>;
  aoFechar: () => void;
  gravacao: {
    gravando: boolean;
    gravadoEm: string | null;
    alterado: boolean;
    aviso: { tipo: "ok" | "erro"; texto: string } | null;
    aoGravar: () => void;
    aoApagar: () => void;
  };
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set(["vinculacao", "status"]));
  const [buscaNoFiltro, setBuscaNoFiltro] = useState<Record<string, string>>({});
  const [idsColados, setIdsColados] = useState("");

  const alternarAberto = (chave: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  function marcar(chave: string, valor: string, marcado: boolean) {
    const todos = valores[chave].map((v) => v.valor);
    const atual = estado.selecao[chave] ?? new Set(todos);
    const novo = new Set(atual);
    if (marcado) novo.add(valor);
    else novo.delete(valor);
    setEstado({ ...estado, selecao: { ...estado.selecao, [chave]: novo.size === todos.length ? null : novo } });
  }

  const campo = "w-full rounded-lg border border-black/10 bg-plane px-2 py-1.5 text-xs font-normal text-ink-primary focus:outline-none";

  return (
    <aside className="w-full shrink-0 rounded-xl border border-black/5 bg-surface shadow-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-80 lg:overflow-y-auto">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">Filtros</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setEstado(estadoPadrao())} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-plane" title="Limpa todos os filtros">
            <RotateCcw size={12} /> Limpar tudo
          </button>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar filtros">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="space-y-3 border-b border-black/5 px-4 py-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Buscar por ID, nome ou órgão
          <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-black/10 bg-plane px-2">
            <Search size={12} className="text-ink-muted" />
            <input
              value={estado.busca}
              onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
              placeholder="ID ou parte do nome..."
              className="w-full bg-transparent py-1.5 text-xs font-normal normal-case text-ink-primary focus:outline-none"
            />
          </span>
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          % de execução (mínimo)
          <span className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={estado.pctMinimo ?? ""}
              onChange={(e) => setEstado({ ...estado, pctMinimo: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
              placeholder="sem corte"
              className="w-24 rounded-lg border border-black/10 bg-plane px-2 py-1.5 text-xs font-normal text-ink-primary focus:outline-none"
            />
            <span className="text-xs font-normal normal-case text-ink-muted">maior ou igual a, em %</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Criada de
            <input type="date" value={estado.de} onChange={(e) => setEstado({ ...estado, de: e.target.value })} className={campo + " mt-1"} />
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            até
            <input type="date" value={estado.ate} onChange={(e) => setEstado({ ...estado, ate: e.target.value })} className={campo + " mt-1"} />
          </label>
        </div>
      </div>

      {FILTROS.map((f) => {
        const lista = valores[f.chave] ?? [];
        const sel = estado.selecao[f.chave];
        const aberto = abertos.has(f.chave);
        const termo = (buscaNoFiltro[f.chave] ?? "").toLowerCase();
        const encontrados = termo ? lista.filter((v) => v.valor.toLowerCase().includes(termo)) : lista;
        const LIMITE = 300;
        const visiveis = encontrados.slice(0, LIMITE);
        const ehId = f.chave === "id";
        return (
          <div key={f.chave} className="border-b border-black/5 last:border-0">
            <button onClick={() => alternarAberto(f.chave)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-plane/60">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-primary">
                {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="truncate">{f.rotulo}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sel ? "bg-series-1/10 text-series-1" : "bg-plane text-ink-muted"}`}>
                {sel ? `${sel.size} de ${lista.length}` : `todos (${lista.length})`}
              </span>
            </button>
            {aberto && (
              <div className="px-4 pb-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <button onClick={() => setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: null } })} className="font-medium text-series-1 hover:underline">
                    Marcar todos
                  </button>
                  <button onClick={() => setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: new Set() } })} className="font-medium text-ink-muted hover:underline">
                    Limpar
                  </button>
                </div>
                {(lista.length > 10 || ehId) && (
                  <input
                    value={buscaNoFiltro[f.chave] ?? ""}
                    onChange={(e) => setBuscaNoFiltro({ ...buscaNoFiltro, [f.chave]: e.target.value })}
                    placeholder="Pesquisar..."
                    className="mb-1.5 w-full rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-primary focus:outline-none"
                  />
                )}
                {termo && encontrados.length > 0 && (
                  <button
                    onClick={() => setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: new Set(encontrados.map((v) => v.valor)) } })}
                    className="mb-1.5 text-[11px] font-medium text-series-1 hover:underline"
                    title="Deixa marcados somente os valores que apareceram na pesquisa"
                  >
                    Marcar só os {inteiro(encontrados.length)} resultado(s) da pesquisa
                  </button>
                )}
                {ehId && (
                  <div className="mb-1.5 space-y-1">
                    <textarea
                      value={idsColados}
                      onChange={(e) => setIdsColados(e.target.value)}
                      rows={2}
                      placeholder="Cole vários IDs (vírgula, espaço ou linha)"
                      className="w-full rounded-lg border border-black/10 bg-plane px-2 py-1 font-mono text-xs text-ink-primary focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const existentes = new Set(lista.map((v) => v.valor));
                        const pedidos = lerIds(idsColados).filter((i) => existentes.has(i));
                        setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: new Set(pedidos) } });
                      }}
                      disabled={idsColados.trim() === ""}
                      className="text-[11px] font-medium text-series-1 hover:underline disabled:opacity-40"
                    >
                      Marcar só os IDs colados
                    </button>
                  </div>
                )}
                <ul className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
                  {visiveis.map((v) => (
                    <li key={v.valor}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink-secondary hover:bg-plane">
                        <input type="checkbox" checked={sel ? sel.has(v.valor) : true} onChange={(e) => marcar(f.chave, v.valor, e.target.checked)} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate" title={v.valor}>
                          {v.valor}
                        </span>
                        {!ehId && <span className="tabular shrink-0 text-[10px] text-ink-muted">{inteiro(v.qtd)}</span>}
                      </label>
                    </li>
                  ))}
                  {visiveis.length === 0 && <li className="px-1 py-1 text-xs text-ink-muted">Nada encontrado.</li>}
                  {encontrados.length > LIMITE && (
                    <li className="px-1 py-1 text-[11px] text-ink-muted">
                      Mostrando {LIMITE} de {inteiro(encontrados.length)}. Pesquise para achar o que procura.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      <div className="sticky bottom-0 space-y-2 border-t border-black/10 bg-surface px-4 py-3">
        <button
          onClick={gravacao.aoGravar}
          disabled={gravacao.gravando}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-series-1 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          title="Grava os filtros atuais: ao voltar a esta tela, eles já vêm aplicados"
        >
          <Save size={13} /> {gravacao.gravando ? "Gravando..." : "Gravar filtro"}
        </button>
        <p className="text-[11px] leading-snug text-ink-muted">
          {gravacao.gravadoEm
            ? gravacao.alterado
              ? "Você mudou os filtros depois da última gravação. Clique em Gravar filtro para guardar."
              : "Filtro gravado em " + new Date(gravacao.gravadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + "."
            : "Nenhum filtro gravado: a tela abre mostrando todas as ações."}
        </p>
        {gravacao.gravadoEm && (
          <button onClick={gravacao.aoApagar} disabled={gravacao.gravando} className="text-[11px] font-medium text-ink-muted hover:text-ink-primary hover:underline disabled:opacity-50">
            Apagar filtro gravado
          </button>
        )}
        {gravacao.aviso && <p className={"text-[11px] font-medium " + (gravacao.aviso.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{gravacao.aviso.texto}</p>}
      </div>
    </aside>
  );
}

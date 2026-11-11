"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, ExternalLink, Save } from "lucide-react";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";
import { IdAcaoLink, urlAcaoSimo } from "@/components/IdAcaoLink";
import { PESO_GRAVIDADE, TITULOS_PROBLEMA, type Gravidade, type LinhaAuditoria, type ResumoTipologia } from "@/lib/auditoriaQuantitativo";

type Gravado = { estado: unknown; atualizadoEm: string; por: string | null };
type Selecao = Record<string, Set<string> | null>;
type EstadoGravado = { selecao: Record<string, string[] | null>; busca: string; ids: string; mostrar: "problemas" | "todas" };

const TELA = "nova_analise_teste";
const PAGINA = 25;
const ROTULO_GRAV: Record<Gravidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const COR_GRAV: Record<Gravidade, string> = {
  alta: "bg-status-critical/10 text-status-critical",
  media: "bg-status-warning-bg text-status-warning",
  baixa: "bg-black/5 text-ink-muted",
};

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-3 focus:outline-none";
const vazio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "(vazio)");
const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Linha = LinhaAuditoria & { grav: Gravidade | null; score: number };

const DEFINICOES: { chave: string; rotulo: string }[] = [
  { chave: "problema", rotulo: "Tipo de problema" },
  { chave: "gravidade", rotulo: "Gravidade" },
  { chave: "tipologia", rotulo: "Tipologia" },
  { chave: "unidade", rotulo: "Unidade" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "orgao", rotulo: "Órgão" },
  { chave: "status", rotulo: "Status" },
  { chave: "estagio", rotulo: "Estágio atual" },
];

function lerGravado(g: unknown): EstadoGravado | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Partial<EstadoGravado>;
  const selecao: Record<string, string[] | null> = {};
  if (o.selecao && typeof o.selecao === "object") for (const [k, v] of Object.entries(o.selecao)) selecao[k] = Array.isArray(v) ? v.map(String) : null;
  return { selecao, busca: typeof o.busca === "string" ? o.busca : "", ids: typeof o.ids === "string" ? o.ids : "", mostrar: o.mostrar === "todas" ? "todas" : "problemas" };
}

export function NovaAnaliseTeste({ linhas, tipologias, filtroGravado }: { linhas: LinhaAuditoria[]; tipologias: ResumoTipologia[]; filtroGravado: Gravado | null }) {
  const inicial = useMemo(() => lerGravado(filtroGravado?.estado), [filtroGravado]);
  const padrao = (): Selecao => ({ classificacao: linhas.some((l) => l.classificacao === "OBRA") ? new Set(["OBRA"]) : null });
  const [selecao, setSelecao] = useState<Selecao>(() => (inicial ? Object.fromEntries(Object.entries(inicial.selecao).map(([k, v]) => [k, v ? new Set(v) : null])) : padrao()));
  const [busca, setBusca] = useState(inicial?.busca ?? "");
  const [ids, setIds] = useState(inicial?.ids ?? "");
  const [mostrar, setMostrar] = useState<"problemas" | "todas">(inicial?.mostrar ?? "problemas");
  const [pagina, setPagina] = useState(1);
  const [abertoTip, setAbertoTip] = useState(false);

  // Gravar filtro (um só, vale para todos).
  const [gravadoEm, setGravadoEm] = useState<string | null>(filtroGravado?.atualizadoEm ?? null);
  const [gravadoPor, setGravadoPor] = useState<string | null>(filtroGravado?.por ?? null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const paraGravar = (): EstadoGravado => ({ selecao: Object.fromEntries(Object.entries(selecao).map(([k, v]) => [k, v ? Array.from(v).sort() : null])), busca, ids, mostrar });
  const jsonAtual = JSON.stringify(paraGravar());
  const [gravadoJson, setGravadoJson] = useState<string | null>(inicial ? JSON.stringify({ ...inicial, selecao: Object.fromEntries(Object.entries(inicial.selecao).map(([k, v]) => [k, v ? [...v].sort() : null])) }) : null);
  const alterado = gravadoJson !== null && gravadoJson !== jsonAtual;

  const todas: Linha[] = useMemo(
    () =>
      linhas.map((l) => {
        const grav = l.achados.length ? (l.achados.reduce((m, a) => (PESO_GRAVIDADE[a.gravidade] > PESO_GRAVIDADE[m] ? a.gravidade : m), "baixa" as Gravidade)) : null;
        return { ...l, grav, score: l.achados.reduce((s, a) => s + PESO_GRAVIDADE[a.gravidade], 0) };
      }),
    [linhas]
  );

  const valoresDe = (l: Linha, chave: string): string[] => {
    switch (chave) {
      case "problema":
        return l.achados.length ? Array.from(new Set(l.achados.map((a) => a.titulo))) : ["(sem problema)"];
      case "gravidade":
        return [l.grav ? ROTULO_GRAV[l.grav] : "Sem problema"];
      case "tipologia":
        return [vazio(l.tipologia)];
      case "unidade":
        return [vazio(l.unidade).toUpperCase()];
      case "classificacao":
        return [vazio(l.classificacao)];
      case "orgao":
        return [vazio(l.orgao)];
      case "status":
        return [vazio(l.status)];
      default:
        return [vazio(l.estagio)];
    }
  };

  const idsLista = useMemo(() => new Set(ids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)), [ids]);

  // Universo: tudo menos o filtro de "tipo de problema" (os cards de cada problema contam em cima dele).
  const universo = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (idsLista.size && !idsLista.has(l.id)) return false;
      if (q && !(l.id.includes(q) || l.nome.toLowerCase().includes(q) || (l.orgao ?? "").toLowerCase().includes(q) || (l.tipologia ?? "").toLowerCase().includes(q))) return false;
      for (const d of DEFINICOES) {
        if (d.chave === "problema") continue;
        const sel = selecao[d.chave];
        if (sel && !valoresDe(l, d.chave).some((v) => sel.has(v))) return false;
      }
      return true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, busca, idsLista, selecao]);

  const filtradas = useMemo(() => {
    const sel = selecao.problema;
    const lista = universo.filter((l) => (mostrar === "todas" ? true : l.achados.length > 0) && (!sel || valoresDe(l, "problema").some((v) => sel.has(v))));
    return [...lista].sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universo, selecao.problema, mostrar]);

  const opcoes = useMemo(() => {
    const out: Record<string, { valor: string; qtd: number }[]> = {};
    for (const d of DEFINICOES) {
      const m = new Map<string, number>();
      for (const l of todas) for (const v of valoresDe(l, d.chave)) m.set(v, (m.get(v) ?? 0) + 1);
      out[d.chave] = Array.from(m, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas]);

  const numeros = useMemo(() => {
    const comProblema = universo.filter((l) => l.achados.length > 0);
    const porGrav = { alta: 0, media: 0, baixa: 0 };
    for (const l of comProblema) if (l.grav) porGrav[l.grav]++;
    const porTipo = new Map<string, { qtd: number; grav: Gravidade }>();
    for (const l of comProblema) {
      for (const a of l.achados) {
        const x = porTipo.get(a.titulo) ?? { qtd: 0, grav: a.gravidade };
        x.qtd++;
        if (PESO_GRAVIDADE[a.gravidade] > PESO_GRAVIDADE[x.grav]) x.grav = a.gravidade;
        porTipo.set(a.titulo, x);
      }
    }
    return { total: universo.length, comProblema: comProblema.length, porGrav, tipos: Array.from(porTipo, ([titulo, v]) => ({ titulo, ...v })).sort((a, b) => b.qtd - a.qtd) };
  }, [universo]);

  const resumoTip = useMemo(() => {
    const dados = new Map(tipologias.map((t) => [t.tipologia.toUpperCase(), t]));
    const m = new Map<string, { nome: string; acoes: number; comProblema: number }>();
    for (const l of universo) {
      const nome = vazio(l.tipologia);
      const k = nome.toUpperCase();
      const x = m.get(k) ?? { nome, acoes: 0, comProblema: 0 };
      x.acoes++;
      if (l.achados.length) x.comProblema++;
      m.set(k, x);
    }
    return Array.from(m.entries())
      .map(([k, x]) => ({ ...x, ref: dados.get(k) }))
      .sort((a, b) => b.comProblema - a.comProblema || b.acoes - a.acoes);
  }, [universo, tipologias]);

  const ativos = Object.entries(selecao).filter(([, v]) => v !== null).length + (busca ? 1 : 0) + (ids ? 1 : 0);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGINA));
  const paginaOk = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaOk - 1) * PAGINA, paginaOk * PAGINA);
  const mudarSel = (chave: string) => (v: Set<string> | null) => {
    setSelecao((s) => ({ ...s, [chave]: v }));
    setPagina(1);
  };
  const filtrarProblema = (titulo: string) => {
    const atual = selecao.problema;
    mudarSel("problema")(atual && atual.size === 1 && atual.has(titulo) ? null : new Set([titulo]));
  };

  async function gravarFiltro() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tela: TELA, estado: paraGravar() }) });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; atualizadoEm?: string };
      if (!resp.ok) setAviso({ tipo: "erro", texto: json.error ?? "Não foi possível gravar o filtro." });
      else {
        setGravadoEm(json.atualizadoEm ?? new Date().toISOString());
        setGravadoPor("você");
        setGravadoJson(jsonAtual);
        setAviso({ tipo: "ok", texto: "Filtro gravado para todos os usuários." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  async function apagarGravado() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch(`/api/filtros?tela=${TELA}`, { method: "DELETE" });
      if (!resp.ok) setAviso({ tipo: "erro", texto: "Não foi possível apagar o filtro gravado." });
      else {
        setGravadoEm(null);
        setGravadoPor(null);
        setGravadoJson(null);
        setSelecao(padrao());
        setBusca("");
        setIds("");
        setMostrar("problemas");
        setPagina(1);
        setAviso({ tipo: "ok", texto: "Filtro gravado apagado para todos." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  function exportar() {
    const colunas = ["ID da Ação", "Link no SIMO", "Nome da Ação", "Órgão", "Tipologia", "Unidade", "Quantidade", "Valor (total do contrato)", "Custo por unidade", "Gravidade", "Problemas", "Detalhes", "Sugestões"];
    const dados = filtradas.map((l) =>
      [
        l.id,
        urlAcaoSimo(l.id),
        l.nome,
        l.orgao,
        l.tipologia,
        l.unidade,
        l.quantidade != null ? String(l.quantidade).replace(".", ",") : "",
        l.valor != null ? l.valor.toFixed(2).replace(".", ",") : "",
        l.custoUnit != null ? l.custoUnit.toFixed(2).replace(".", ",") : "",
        l.grav ? ROTULO_GRAV[l.grav] : "",
        l.achados.map((a) => a.titulo).join(" | "),
        l.achados.map((a) => a.detalhe).join(" | "),
        l.achados.map((a) => a.sugestao).filter(Boolean).join(" | "),
      ]
        .map(csvEscape)
        .join(";")
    );
    const csv = "﻿" + [colunas.join(";"), ...dados].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-quantitativo-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const cartao = (rotulo: string, valor: string, dica?: string, cor?: string) => (
    <div className="rounded-xl border border-black/5 bg-surface p-3 shadow-card" title={dica}>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{rotulo}</p>
      <p className={"tabular mt-1 text-lg font-semibold " + (cor ?? "text-ink-primary")}>{valor}</p>
      {dica && <p className="text-[11px] leading-snug text-ink-muted">{dica}</p>}
    </div>
  );

  const pctProb = numeros.total ? ((numeros.comProblema / numeros.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "-";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-xs font-medium text-status-warning">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <span>
            <strong>Análise em teste.</strong> Cruza tipologia, unidade de medida e quantidade de todas as ações para achar o que não faz sentido: unidade que não combina com a tipologia, quantidade diferente do texto da ação, quantidade ou custo por unidade muito fora do padrão, quantidade impossível e km diferente do traçado (KML). São <strong>indícios</strong>: cada problema mostra o motivo, e o ID abre a ação no SIMO para corrigir.
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {DEFINICOES.map((d) => (
            <FiltroCheckbox key={d.chave} rotulo={d.rotulo} opcoes={opcoes[d.chave] ?? []} selecionados={selecao[d.chave] ?? null} aoMudar={mudarSel(d.chave)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar ID, nome, órgão ou tipologia..." className={campo + " w-72"} />
          <input value={ids} onChange={(e) => { setIds(e.target.value); setPagina(1); }} placeholder="Só estes IDs (cole vários)..." className={campo + " w-64"} />
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Mostrar
            <select value={mostrar} onChange={(e) => { setMostrar(e.target.value as "problemas" | "todas"); setPagina(1); }} className={campo}>
              <option value="problemas">Só as com problema</option>
              <option value="todas">Todas as ações</option>
            </select>
          </label>
          {ativos > 0 && (
            <button onClick={() => { setSelecao({}); setBusca(""); setIds(""); setPagina(1); }} className="text-xs font-medium text-series-3 hover:underline">
              limpar {ativos} filtro(s)
            </button>
          )}
          <button onClick={gravarFiltro} disabled={gravando} title="Grava os filtros atuais para TODOS os usuários" className="ml-auto flex items-center gap-1.5 rounded-full bg-series-3 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Save size={13} /> {gravando ? "Gravando..." : "Gravar filtro"}
          </button>
          <button onClick={exportar} disabled={filtradas.length === 0} className="flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Download size={13} /> Exportar Excel
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-ink-muted">
          {gravadoEm
            ? alterado
              ? "Você mudou os filtros depois da última gravação. Clique em Gravar filtro para guardar (vale para todos)."
              : "Filtro gravado em " + new Date(gravadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (gravadoPor ? " por " + gravadoPor : "") + ". Vale para todos os usuários."
            : "Nenhum filtro gravado: a tela abre só com a classificação OBRA."}
          {gravadoEm && (
            <button onClick={apagarGravado} disabled={gravando} className="ml-2 font-medium hover:text-ink-primary hover:underline disabled:opacity-50">
              Apagar filtro gravado (para todos)
            </button>
          )}
          {aviso && <span className={"ml-2 font-medium " + (aviso.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{aviso.texto}</span>}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartao("Ações analisadas", inteiro(numeros.total), "Dentro dos filtros (menos o de tipo de problema).")}
        {cartao("Com algum problema", inteiro(numeros.comProblema), pctProb + " das analisadas", numeros.comProblema ? "text-status-critical" : "text-status-good")}
        {cartao("Gravidade alta", inteiro(numeros.porGrav.alta), "Quase certamente erro: comece por aqui.", "text-status-critical")}
        {cartao("Gravidade média", inteiro(numeros.porGrav.media), "Vale conferir no SIMO.", "text-status-warning")}
        {cartao("Gravidade baixa", inteiro(numeros.porGrav.baixa), "Detalhe de cadastro.")}
        {cartao("Sem problema", inteiro(numeros.total - numeros.comProblema), "Nenhuma regra encontrou indício.", "text-status-good")}
      </section>

      {numeros.tipos.length > 0 && (
        <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <p className="mb-2 text-xs font-semibold text-ink-primary">Problemas encontrados <span className="font-normal text-ink-muted">(clique para filtrar a lista; clique de novo para voltar)</span></p>
          <div className="flex flex-wrap gap-2">
            {numeros.tipos.map((t) => {
              const ativo = selecao.problema?.size === 1 && selecao.problema.has(t.titulo);
              return (
                <button key={t.titulo} onClick={() => filtrarProblema(t.titulo)} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs " + (ativo ? "border-series-3 bg-series-3/10" : "border-black/10 bg-plane hover:bg-black/5")}>
                  <span className={"rounded px-1.5 py-0.5 text-[10px] font-semibold " + COR_GRAV[t.grav]}>{ROTULO_GRAV[t.grav]}</span>
                  <span className="text-ink-primary">{t.titulo}</span>
                  <span className="tabular font-semibold text-ink-primary">{inteiro(t.qtd)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/5 bg-surface shadow-card">
        <button onClick={() => setAbertoTip((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold text-ink-primary">
          {abertoTip ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Resumo por tipologia <span className="font-normal text-ink-muted">· a unidade que a maioria usa, a quantidade típica (mediana) e quantas ações têm problema</span>
        </button>
        {abertoTip && (
          <div className="max-h-[420px] overflow-auto border-t border-black/5">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-plane">
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2">Tipologia</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                  <th className="px-3 py-2 text-right">Com problema</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2">Unidade da maioria</th>
                  <th className="px-3 py-2 text-right">Quantidade típica</th>
                  <th className="px-3 py-2 text-right">Custo típico por unidade</th>
                </tr>
              </thead>
              <tbody>
                {resumoTip.map((t) => (
                  <tr key={t.nome} className="border-t border-black/5 hover:bg-plane/60">
                    <td className="px-4 py-1.5">
                      <button onClick={() => mudarSel("tipologia")(new Set([t.nome]))} className="font-medium text-ink-primary hover:underline" title="Filtrar por esta tipologia">
                        {t.nome}
                      </button>
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{inteiro(t.acoes)}</td>
                    <td className={"tabular px-3 py-1.5 text-right " + (t.comProblema ? "font-medium text-status-critical" : "text-ink-muted")}>{inteiro(t.comProblema)}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-secondary">{t.acoes ? ((t.comProblema / t.acoes) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%" : "-"}</td>
                    <td className="px-3 py-1.5 text-ink-secondary">{t.ref?.unidadeDominante ? `${t.ref.unidadeDominante} (${(t.ref.shareDominante * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%)` : "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-secondary">{t.ref?.medianaQtd != null ? t.ref.medianaQtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-secondary">{t.ref?.medianaCusto != null ? brl(t.ref.medianaCusto) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">ID</th>
              <th className="px-3 py-2.5">Ação</th>
              <th className="px-3 py-2.5">Tipologia</th>
              <th className="px-3 py-2.5">Unidade</th>
              <th className="px-3 py-2.5 text-right">Quantidade</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5 text-right" title="Valor ÷ quantidade">R$/un.</th>
              <th className="px-3 py-2.5">O que encontramos</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id} className="border-b border-black/5 align-top hover:bg-plane/40">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <IdAcaoLink id={l.id} />
                  <a href={urlAcaoSimo(l.id)} target="_blank" rel="noopener noreferrer" title="Abrir no SIMO para corrigir" className="ml-1 inline-block align-middle text-ink-muted hover:text-series-1">
                    <ExternalLink size={11} />
                  </a>
                </td>
                <td className="max-w-[300px] px-3 py-2.5">
                  <div className="line-clamp-3 text-ink-primary" title={l.nome}>{l.nome}</div>
                  <div className="text-[11px] text-ink-muted">{l.orgao ?? "-"} · {l.status ?? "-"}</div>
                </td>
                <td className="px-3 py-2.5 text-ink-secondary">{l.tipologia ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-series-1">{l.unidade?.trim() || "-"}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-medium text-series-1">{l.quantidade != null ? l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-"}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-ink-secondary">{l.valor != null ? brl(l.valor) : "-"}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-ink-secondary">{l.custoUnit != null ? brl(l.custoUnit) : "-"}</td>
                <td className="min-w-[340px] px-3 py-2.5">
                  {l.achados.length === 0 ? (
                    <span className="text-status-good">Sem problema</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {l.achados.map((a, i) => (
                        <li key={i}>
                          <span className={"mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold " + COR_GRAV[a.gravidade]}>{ROTULO_GRAV[a.gravidade]}</span>
                          <strong className="text-ink-primary">{a.titulo}</strong>
                          <div className="text-ink-secondary">{a.detalhe}</div>
                          {a.sugestao && <div className="italic text-series-3">→ {a.sugestao}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">Nenhuma ação com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
          <span>
            {inteiro(filtradas.length)} ação(ões) · página {paginaOk} de {totalPaginas} · ordenadas das mais graves para as menos graves
          </span>
          <span className="flex gap-2">
            <button disabled={paginaOk <= 1} onClick={() => setPagina(paginaOk - 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
            <button disabled={paginaOk >= totalPaginas} onClick={() => setPagina(paginaOk + 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Próxima</button>
          </span>
        </div>
      </section>
      <p className="text-[11px] text-ink-muted">Tipos de problema verificados: {Object.values(TITULOS_PROBLEMA).join(" · ")}.</p>
    </div>
  );
}

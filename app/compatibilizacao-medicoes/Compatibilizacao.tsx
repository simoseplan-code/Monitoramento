"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, Download, RefreshCw, Square } from "lucide-react";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";
import { IdAcaoLink } from "@/components/IdAcaoLink";

export type LinhaMedicao = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  contratado: number | null;
  pct: number | null;
  /** Valores de filtro vindos das colunas da ação (cada chave guarda uma lista; vazio = "(vazio)"). */
  campos: Record<string, string[]>;
  /** "Valor medido do estágio": o valor medido da ação, vindo do relatório do SIMO. */
  medidoEstagio: number | null;
  lida: boolean;
  lidoEm: string | null;
  erroLeitura: string | null;
  boletins: { numero: string; data: string | null; tipo: string; responsavel: string; valor: number }[];
};

const ANOS = ["2023", "2024", "2025", "2026"] as const;
const OUTROS = "Outros anos";
const PAGINA = 50;

const SITUACOES = {
  compativel: "Compatível",
  maior: "Boletins somam mais que o medido",
  menor: "Boletins somam menos que o medido",
  semBoletimComMedido: "Sem boletim (mas tem valor medido)",
  semBoletim: "Sem boletim e sem valor medido",
  semMedido: "Sem valor medido no relatório",
  naoLida: "Ainda não lida no SIMO",
  erro: "Erro na leitura do SIMO",
} as const;
type Situacao = keyof typeof SITUACOES;

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-3 focus:outline-none";
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "-");
const anoDe = (iso: string | null): string => {
  const a = iso?.slice(0, 4) ?? "";
  return (ANOS as readonly string[]).includes(a) ? a : OUTROS;
};

type Calc = LinhaMedicao & {
  porAno: Record<string, number>;
  soma: number;
  dif: number | null;
  situacao: Situacao;
  anosComMedicao: string[];
  filtro: Record<string, string[]>;
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const num = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));

function contar(valores: (string | null | undefined)[]): { valor: string; qtd: number }[] {
  const m = new Map<string, number>();
  for (const v of valores) {
    const k = (v ?? "").trim() || "(vazio)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));
}

type Selecao = Record<string, Set<string> | null>;

// Todos os filtros da tela, na ordem em que aparecem.
const DEFINICOES: { chave: string; rotulo: string }[] = [
  { chave: "situacao", rotulo: "Situação" },
  { chave: "ano", rotulo: "Ano com medição" },
  { chave: "qtd", rotulo: "Qtd de boletins" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "vinculacao", rotulo: "Vinculação SIAFE" },
  { chave: "status", rotulo: "Status" },
  { chave: "orgao", rotulo: "Órgão" },
  { chave: "estagio", rotulo: "Estágio atual" },
  { chave: "tipologia", rotulo: "Tipologia" },
  { chave: "eixo", rotulo: "Eixo" },
  { chave: "anoReceb", rotulo: "Ano de recebimento" },
  { chave: "anoCriacao", rotulo: "Ano de criação" },
  { chave: "municipio", rotulo: "Município (SIMO)" },
  { chave: "territorio", rotulo: "Território (SIMO)" },
  { chave: "unidade", rotulo: "Unidade de medida" },
  { chave: "tipoOutros", rotulo: "Tipo de outros documentos" },
  { chave: "conveniada", rotulo: "Ação conveniada" },
  { chave: "aditivo", rotulo: "Aditivo" },
  { chave: "respBoletim", rotulo: "Responsável do boletim" },
  { chave: "tipoBoletim", rotulo: "Tipo do boletim" },
];
const vazio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "(vazio)");

export function Compatibilizacao({ linhas, chaveMedido, ehAdmin, semTabelas }: { linhas: LinhaMedicao[]; chaveMedido: string | null; ehAdmin: boolean; semTabelas: boolean }) {
  const router = useRouter();
  const [tolerancia, setTolerancia] = useState(10);
  const [pctMinimo, setPctMinimo] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [ids, setIds] = useState("");
  const [selecao, setSelecao] = useState<Selecao>(() => ({ classificacao: linhas.some((l) => l.classificacao === "OBRA") ? new Set(["OBRA"]) : null }));
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<Set<string>>(new Set());
  const [reler, setReler] = useState(false);
  const [lendo, setLendo] = useState<{ feitas: number; total: number; falhas: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const parar = useRef(false);

  // Cálculo de cada ação: boletins por ano, soma, diferença contra o valor medido do estágio e situação.
  const calc: Calc[] = useMemo(
    () =>
      linhas.map((l) => {
        const porAno: Record<string, number> = { ...Object.fromEntries(ANOS.map((a) => [a, 0])), [OUTROS]: 0 };
        for (const b of l.boletins) porAno[anoDe(b.data)] += b.valor;
        const soma = l.boletins.reduce((t, b) => t + b.valor, 0);
        const dif = l.medidoEstagio == null ? null : soma - l.medidoEstagio;
        let situacao: Situacao;
        if (l.erroLeitura) situacao = "erro";
        else if (!l.lida) situacao = "naoLida";
        else if (l.boletins.length === 0) situacao = (l.medidoEstagio ?? 0) > tolerancia ? "semBoletimComMedido" : "semBoletim";
        else if (dif == null) situacao = "semMedido";
        else if (Math.abs(dif) <= tolerancia) situacao = "compativel";
        else situacao = dif > 0 ? "maior" : "menor";
        const anosComMedicao = Array.from(new Set(l.boletins.map((b) => anoDe(b.data))));
        const n = l.boletins.length;
        const filtro: Record<string, string[]> = {
          ...l.campos,
          situacao: [SITUACOES[situacao]],
          ano: anosComMedicao.length ? anosComMedicao : ["(sem boletim)"],
          qtd: [n === 0 ? "Nenhum" : n === 1 ? "1 boletim" : n === 2 ? "2 boletins" : "3 ou mais"],
          classificacao: [vazio(l.classificacao)],
          status: [vazio(l.status)],
          orgao: [vazio(l.orgao)],
          estagio: [vazio(l.estagio)],
          tipologia: [vazio(l.tipologia)],
          respBoletim: n ? Array.from(new Set(l.boletins.map((b) => vazio(b.responsavel)))) : ["(sem boletim)"],
          tipoBoletim: n ? Array.from(new Set(l.boletins.map((b) => vazio(b.tipo)))) : ["(sem boletim)"],
        };
        return { ...l, porAno, soma, dif, situacao, anosComMedicao, filtro };
      }),
    [linhas, tolerancia]
  );

  const opcoes = useMemo(() => {
    const out: Record<string, { valor: string; qtd: number }[]> = {};
    for (const d of DEFINICOES) {
      const m = new Map<string, number>();
      for (const l of calc) for (const v of l.filtro[d.chave] ?? ["(vazio)"]) m.set(v, (m.get(v) ?? 0) + 1);
      out[d.chave] = Array.from(m, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true }));
    }
    // Situação e ano sempre com todas as opções, mesmo as sem nenhuma ação.
    out.situacao = (Object.keys(SITUACOES) as Situacao[]).map((x) => ({ valor: SITUACOES[x], qtd: calc.filter((l) => l.situacao === x).length }));
    out.ano = [...ANOS, OUTROS].map((a) => ({ valor: a, qtd: calc.filter((l) => l.anosComMedicao.includes(a)).length }));
    return out;
  }, [calc]);

  const idsLista = useMemo(() => new Set(ids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)), [ids]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return calc.filter((l) => {
      if (idsLista.size && !idsLista.has(l.id)) return false;
      if (q && !(l.id.includes(q) || l.nome.toLowerCase().includes(q) || (l.orgao ?? "").toLowerCase().includes(q))) return false;
      if (pctMinimo != null && (l.pct ?? 0) * 100 < pctMinimo) return false;
      for (const d of DEFINICOES) {
        const sel = selecao[d.chave];
        if (sel && !(l.filtro[d.chave] ?? ["(vazio)"]).some((v) => sel.has(v))) return false;
      }
      return true;
    });
  }, [calc, busca, idsLista, selecao, pctMinimo]);

  const totais = useMemo(() => {
    const t = { medido: 0, soma: 0, difAbs: 0, porAno: { ...Object.fromEntries(ANOS.map((a) => [a, 0])), [OUTROS]: 0 } as Record<string, number>, lidas: 0, situ: {} as Record<string, number> };
    for (const l of filtradas) {
      t.medido += l.medidoEstagio ?? 0;
      t.soma += l.soma;
      if (l.dif != null && l.lida && l.situacao !== "semBoletim") t.difAbs += Math.abs(l.dif);
      for (const a of Object.keys(l.porAno)) t.porAno[a] += l.porAno[a];
      if (l.lida) t.lidas++;
      t.situ[l.situacao] = (t.situ[l.situacao] ?? 0) + 1;
    }
    return t;
  }, [filtradas]);

  const ativos = Object.entries(selecao).filter(([, v]) => v !== null).length + (busca ? 1 : 0) + (ids ? 1 : 0) + (pctMinimo != null ? 1 : 0);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGINA));
  const paginaOk = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaOk - 1) * PAGINA, paginaOk * PAGINA);
  const mudarSel = (chave: string) => (v: Set<string> | null) => {
    setSelecao((s) => ({ ...s, [chave]: v }));
    setPagina(1);
  };

  const paraLer = filtradas.filter((l) => reler || !l.lida || l.erroLeitura).map((l) => l.id);

  async function lerNoSimo() {
    if (paraLer.length === 0) return;
    const minutos = Math.max(1, Math.round((paraLer.length * 0.8) / 60));
    if (!confirm(`Ler no SIMO os boletins de ${inteiro(paraLer.length)} ação(ões)? Leva cerca de ${inteiro(minutos)} min (uma consulta por ação). Pode parar a qualquer momento e continuar depois; só lê o SIMO, não altera nada lá.`)) return;
    parar.current = false;
    setAviso(null);
    let fila = [...paraLer];
    let feitas = 0;
    let falhas = 0;
    setLendo({ feitas, total: paraLer.length, falhas });
    try {
      while (fila.length && !parar.current) {
        const lote = fila.slice(0, 60);
        const resp = await fetch("/api/admin/medicoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: lote }) });
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.error ?? "Falha ao ler o SIMO.");
        const restantes: string[] = dados.restantes ?? [];
        feitas += dados.lidas + dados.falhas;
        falhas += dados.falhas;
        fila = [...restantes, ...fila.slice(lote.length)];
        setLendo({ feitas, total: paraLer.length, falhas });
      }
      setAviso(parar.current ? `Leitura interrompida: ${inteiro(feitas)} lida(s).` : `Leitura concluída: ${inteiro(feitas)} ação(ões)${falhas ? `, ${inteiro(falhas)} com erro` : ""}.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao ler o SIMO.");
    } finally {
      setLendo(null);
      router.refresh();
    }
  }

  function exportar() {
    const colunas = ["ID da Ação", "Nome da Ação", "Órgão", "Status", "Estágio Atual", "Classificação", "Valor contratado", "Valor medido do estágio", ...ANOS.map((a) => `Boletins ${a}`), `Boletins ${OUTROS}`, "Soma dos boletins", "Diferença (boletins - medido)", "Situação", "Qtd de boletins", "Lida no SIMO em"];
    const dados = filtradas.map((l) =>
      [l.id, l.nome, l.orgao, l.status, l.estagio, l.classificacao, num(l.contratado), num(l.medidoEstagio), ...ANOS.map((a) => num(l.porAno[a])), num(l.porAno[OUTROS]), num(l.soma), num(l.dif), SITUACOES[l.situacao], l.boletins.length, l.lidoEm ? new Date(l.lidoEm).toLocaleString("pt-BR") : ""].map(csvEscape).join(";")
    );
    const csv = "﻿" + [colunas.join(";"), ...dados].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `compatibilizacao-medicoes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const cartao = (rotulo: string, valor: string, dica?: string, cor?: string) => (
    <div className="rounded-xl border border-black/5 bg-surface p-3 shadow-card" title={dica}>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{rotulo}</p>
      <p className={"tabular mt-1 text-lg font-semibold " + (cor ?? "text-ink-primary")}>{valor}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-xs font-medium text-status-warning">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <span>
            Os boletins vêm da aba <strong>Boletins de medição</strong> de cada ação no SIMO (leitura, nada é alterado lá). O <strong>valor medido do estágio</strong> é o “Medido” do topo da ação no SIMO, lido junto com os boletins
            {chaveMedido ? (
              <>
                {" "}
                (nas ações ainda não lidas, uso a coluna <strong>{chaveMedido}</strong> do relatório diário)
              </>
            ) : (
              <> (o relatório diário não tem essa coluna, então só aparece nas ações já lidas)</>
            )}
            . Os boletins são somados por ano da data do boletim (2023 a 2026; o resto vai em “{OUTROS}”). Diferença até a tolerância abaixo conta como compatível.
          </span>
        </p>
        {semTabelas && <p className="mb-3 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">As tabelas de medições ainda não existem no banco: rode o SQL 0098 no Supabase.</p>}

        <div className="flex flex-wrap items-center gap-2">
          {DEFINICOES.map((d) => (
            <FiltroCheckbox key={d.chave} rotulo={d.rotulo} opcoes={opcoes[d.chave] ?? []} selecionados={selecao[d.chave] ?? null} aoMudar={mudarSel(d.chave)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar ID, nome ou órgão..." className={campo + " w-64"} />
          <input value={ids} onChange={(e) => { setIds(e.target.value); setPagina(1); }} placeholder="Só estes IDs (cole vários)..." className={campo + " w-64"} />
          <label className="flex items-center gap-2 text-xs text-ink-secondary" title="Só ações com execução física igual ou maior que este percentual.">
            Execução mínima (%)
            <input type="number" min={0} max={100} value={pctMinimo ?? ""} onChange={(e) => { setPctMinimo(e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value)))); setPagina(1); }} className={campo + " w-20"} />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-secondary" title="Diferença aceita entre a soma dos boletins e o valor medido do estágio (arredondamento do SIMO).">
            Tolerância (R$)
            <input type="number" min={0} step={1} value={tolerancia} onChange={(e) => setTolerancia(Math.max(0, Number(e.target.value) || 0))} className={campo + " w-20"} />
          </label>
          {ativos > 0 && (
            <button onClick={() => { setSelecao({}); setBusca(""); setIds(""); setPctMinimo(null); setPagina(1); }} className="text-xs font-medium text-series-3 hover:underline">
              limpar {ativos} filtro(s)
            </button>
          )}
          <button onClick={exportar} disabled={filtradas.length === 0} className="ml-auto flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Download size={13} /> Exportar Excel
          </button>
        </div>

        {ehAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-plane px-3 py-2">
            <p className="text-xs text-ink-secondary">
              <strong className="text-ink-primary">{inteiro(paraLer.length)}</strong> das {inteiro(filtradas.length)} ação(ões) filtradas {reler ? "serão (re)lidas" : "ainda não foram lidas (ou deram erro)"} no SIMO.
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <input type="checkbox" checked={reler} onChange={(e) => setReler(e.target.checked)} className="h-3.5 w-3.5" />
              reler também as já lidas
            </label>
            {lendo ? (
              <>
                <span className="tabular text-xs font-medium text-series-3">
                  Lendo… {inteiro(lendo.feitas)} de {inteiro(lendo.total)}
                  {lendo.falhas ? ` (${inteiro(lendo.falhas)} com erro)` : ""}
                </span>
                <button onClick={() => (parar.current = true)} className="flex items-center gap-1.5 rounded-full bg-status-critical px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <Square size={12} /> Parar
                </button>
              </>
            ) : (
              <button onClick={lerNoSimo} disabled={paraLer.length === 0} className="flex items-center gap-1.5 rounded-full bg-series-3 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60" title="Para ler só alguns IDs, cole-os em “Só estes IDs” antes de clicar.">
                <RefreshCw size={13} /> Ler boletins no SIMO
              </button>
            )}
            {aviso && <span className="text-xs font-medium text-ink-secondary">{aviso}</span>}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(calc.length)} ação(ões) · {inteiro(totais.lidas)} já lida(s) no SIMO
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {cartao("Valor medido do estágio", brl(totais.medido), "Soma do valor medido das ações filtradas (relatório do SIMO).")}
        {cartao("Soma dos boletins", brl(totais.soma), "Soma de todos os boletins lidos das ações filtradas.")}
        {ANOS.map((a) => cartao(`Boletins ${a}`, brl(totais.porAno[a]), `Soma dos boletins com data em ${a}.`))}
        {cartao(`Boletins ${OUTROS}`, brl(totais.porAno[OUTROS]), "Boletins de 2022 e anos anteriores, ou sem data.")}
        {cartao("Compatíveis", inteiro(totais.situ.compativel ?? 0), `Diferença de até ${brl(tolerancia)}.`, "text-status-good")}
        {cartao("Divergentes", inteiro((totais.situ.maior ?? 0) + (totais.situ.menor ?? 0) + (totais.situ.semBoletimComMedido ?? 0)), "Boletins somam mais ou menos que o medido, ou há valor medido sem nenhum boletim.", "text-status-critical")}
        {cartao("Ainda não lidas", inteiro(totais.situ.naoLida ?? 0), "Ainda sem leitura dos boletins no SIMO.", "text-status-warning")}
        {cartao("Soma das diferenças", brl(totais.difAbs), "Soma do valor absoluto da diferença (boletins − medido) nas ações lidas com valor medido.")}
      </section>

      <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="w-6 px-2 py-2.5" />
              <th className="px-3 py-2.5">Ação</th>
              <th className="px-3 py-2.5 text-right" title="Valor medido da ação no relatório do SIMO.">Medido do estágio ⓘ</th>
              {ANOS.map((a) => (
                <th key={a} className="px-3 py-2.5 text-right">{a}</th>
              ))}
              <th className="px-3 py-2.5 text-right">{OUTROS}</th>
              <th className="px-3 py-2.5 text-right" title="Soma de todos os boletins da ação.">Soma boletins ⓘ</th>
              <th className="px-3 py-2.5 text-right" title="Soma dos boletins menos o valor medido do estágio.">Diferença ⓘ</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const abre = aberta.has(l.id);
              const cor = l.situacao === "compativel" ? "text-status-good" : l.situacao === "naoLida" ? "text-ink-muted" : l.situacao === "erro" || l.situacao === "maior" || l.situacao === "menor" || l.situacao === "semBoletimComMedido" ? "text-status-critical" : "text-status-warning";
              return (
                <Fragment key={l.id}>
                  <tr className="border-b border-black/5 hover:bg-plane/60">
                    <td className="px-2 py-2">
                      {l.boletins.length > 0 && (
                        <button onClick={() => setAberta((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} title="Ver os boletins" className="text-ink-muted hover:text-ink-primary">
                          {abre ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                    <td className="max-w-[360px] px-3 py-2">
                      <IdAcaoLink id={l.id} /> <span className="text-ink-muted">· {l.orgao ?? "-"}</span>
                      <div className="truncate text-ink-secondary" title={l.nome}>{l.nome}</div>
                    </td>
                    <td className="tabular px-3 py-2 text-right">{l.medidoEstagio == null ? "-" : brl(l.medidoEstagio)}</td>
                    {ANOS.map((a) => (
                      <td key={a} className="tabular px-3 py-2 text-right text-ink-secondary">{l.porAno[a] ? brl(l.porAno[a]) : "-"}</td>
                    ))}
                    <td className="tabular px-3 py-2 text-right text-ink-secondary">{l.porAno[OUTROS] ? brl(l.porAno[OUTROS]) : "-"}</td>
                    <td className="tabular px-3 py-2 text-right font-medium">{l.lida ? brl(l.soma) : "-"}</td>
                    <td className={"tabular px-3 py-2 text-right " + cor}>{l.dif == null || !l.lida ? "-" : brl(l.dif)}</td>
                    <td className={"px-3 py-2 font-medium " + cor} title={l.erroLeitura ?? undefined}>{SITUACOES[l.situacao]}</td>
                  </tr>
                  {abre && (
                    <tr className="border-b border-black/5 bg-plane/40">
                      <td />
                      <td colSpan={9} className="px-3 py-2">
                        <table className="text-[11px]">
                          <thead>
                            <tr className="text-left text-ink-muted">
                              <th className="pr-6">Nº</th>
                              <th className="pr-6">Data</th>
                              <th className="pr-6">Tipo</th>
                              <th className="pr-6">Responsável</th>
                              <th className="text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {l.boletins.map((b, i) => (
                              <tr key={i} className="text-ink-secondary">
                                <td className="pr-6">{b.numero}</td>
                                <td className="pr-6">{dataBr(b.data)}</td>
                                <td className="pr-6">{b.tipo}</td>
                                <td className="pr-6">{b.responsavel}</td>
                                <td className="tabular text-right">{brl(b.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {l.lidoEm && <p className="mt-1 text-[10px] text-ink-muted">Lido no SIMO em {new Date(l.lidoEm).toLocaleString("pt-BR")}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-ink-muted">Nenhuma ação com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
          <span>Página {paginaOk} de {totalPaginas}</span>
          <span className="flex gap-2">
            <button disabled={paginaOk <= 1} onClick={() => setPagina(paginaOk - 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
            <button disabled={paginaOk >= totalPaginas} onClick={() => setPagina(paginaOk + 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Próxima</button>
          </span>
        </div>
      </section>
    </div>
  );
}

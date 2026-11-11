"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, Info, Save } from "lucide-react";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";
import { IdAcaoLink, urlAcaoSimo } from "@/components/IdAcaoLink";
import { agrupar, custoUnitario, estatistica, valorDaObra, type ObraCusto, type Opcoes } from "@/lib/custosUnitarios";

type Gravado = { estado: unknown; atualizadoEm: string; por: string | null };
type Selecao = Record<string, Set<string> | null>;
type EstadoGravado = { selecao: Record<string, string[] | null>; busca: string; ids: string; base: "final" | "contratado"; correcao: number; incluirSuspeitas: boolean };

const TELA = "analise_custos";
const PAGINA = 25;
const vazio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "(vazio)");
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const brl = (v: number | null) => (v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brlCurto = (v: number) => {
  if (v >= 1e9) return "R$ " + (v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi";
  if (v >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  return brl(v);
};
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";
const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num2 = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));

const DEFINICOES: { chave: string; rotulo: string }[] = [
  { chave: "tipologia", rotulo: "Tipologia" },
  { chave: "unidade", rotulo: "Unidade" },
  { chave: "revestimento", rotulo: "Tipo de pavimento (do nome)" },
  { chave: "servico", rotulo: "Tipo de serviço (do nome)" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "orgao", rotulo: "Órgão" },
  { chave: "status", rotulo: "Status" },
  { chave: "anoReceb", rotulo: "Ano de recebimento" },
  { chave: "anoCriacao", rotulo: "Ano de criação" },
];

function valorDe(o: ObraCusto, chave: string): string {
  switch (chave) {
    case "tipologia":
      return vazio(o.tipologia);
    case "unidade":
      return o.unidade;
    case "revestimento":
      return o.revestimento;
    case "servico":
      return o.servico;
    case "classificacao":
      return vazio(o.classificacao);
    case "orgao":
      return vazio(o.orgao);
    case "status":
      return vazio(o.status);
    case "anoReceb":
      return vazio(o.anoReceb);
    default:
      return vazio(o.anoCriacao);
  }
}

function lerGravado(g: unknown): EstadoGravado | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Partial<EstadoGravado>;
  const selecao: Record<string, string[] | null> = {};
  if (o.selecao && typeof o.selecao === "object") for (const [k, v] of Object.entries(o.selecao)) selecao[k] = Array.isArray(v) ? v.map(String) : null;
  return { selecao, busca: typeof o.busca === "string" ? o.busca : "", ids: typeof o.ids === "string" ? o.ids : "", base: o.base === "contratado" ? "contratado" : "final", correcao: typeof o.correcao === "number" ? o.correcao : 0, incluirSuspeitas: o.incluirSuspeitas === true };
}

export function AnaliseCustos({ obras, anoHoje, filtroGravado }: { obras: ObraCusto[]; anoHoje: number; filtroGravado: Gravado | null }) {
  const inicial = useMemo(() => lerGravado(filtroGravado?.estado), [filtroGravado]);
  const padrao = (): Selecao => ({ classificacao: obras.some((o) => o.classificacao === "OBRA") ? new Set(["OBRA"]) : null });
  const [selecao, setSelecao] = useState<Selecao>(() => (inicial ? Object.fromEntries(Object.entries(inicial.selecao).map(([k, v]) => [k, v ? new Set(v) : null])) : padrao()));
  const [busca, setBusca] = useState(inicial?.busca ?? "");
  const [ids, setIds] = useState(inicial?.ids ?? "");
  const [base, setBase] = useState<"final" | "contratado">(inicial?.base ?? "final");
  const [correcao, setCorrecao] = useState(inicial?.correcao ?? 0);
  const [incluirSuspeitas, setIncluirSuspeitas] = useState(inicial?.incluirSuspeitas ?? false);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  // Suspeitas que a pessoa escolheu incluir na conta, uma a uma (vale só nesta visita).
  const [incluidas, setIncluidas] = useState<Set<string>>(new Set());
  const [paginaSusp, setPaginaSusp] = useState(1);
  const [pagina, setPagina] = useState(1);

  const [gravadoEm, setGravadoEm] = useState<string | null>(filtroGravado?.atualizadoEm ?? null);
  const [gravadoPor, setGravadoPor] = useState<string | null>(filtroGravado?.por ?? null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const paraGravar = (): EstadoGravado => ({ selecao: Object.fromEntries(Object.entries(selecao).map(([k, v]) => [k, v ? Array.from(v).sort() : null])), busca, ids, base, correcao, incluirSuspeitas });
  const jsonAtual = JSON.stringify(paraGravar());
  const [gravadoJson, setGravadoJson] = useState<string | null>(inicial ? JSON.stringify({ ...inicial, selecao: Object.fromEntries(Object.entries(inicial.selecao).map(([k, v]) => [k, v ? [...v].sort() : null])) }) : null);
  const alterado = gravadoJson !== null && gravadoJson !== jsonAtual;

  const op: Opcoes = useMemo(() => ({ base, correcaoAnual: correcao, anoHoje }), [base, correcao, anoHoje]);
  const idsLista = useMemo(() => new Set(ids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)), [ids]);

  const opcoes = useMemo(() => {
    const out: Record<string, { valor: string; qtd: number }[]> = {};
    for (const d of DEFINICOES) {
      const m = new Map<string, number>();
      for (const o of obras) m.set(valorDe(o, d.chave), (m.get(valorDe(o, d.chave)) ?? 0) + 1);
      out[d.chave] = Array.from(m, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true }));
    }
    return out;
  }, [obras]);

  const universo = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return obras.filter((o) => {
      if (idsLista.size && !idsLista.has(o.id)) return false;
      if (q && !(o.id.includes(q) || o.nome.toLowerCase().includes(q) || (o.orgao ?? "").toLowerCase().includes(q) || (o.tipologia ?? "").toLowerCase().includes(q))) return false;
      for (const d of DEFINICOES) {
        const sel = selecao[d.chave];
        if (sel && !sel.has(valorDe(o, d.chave))) return false;
      }
      return true;
    });
  }, [obras, busca, idsLista, selecao]);

  const considerados = useMemo(() => universo.filter((o) => !o.suspeita || incluirSuspeitas || incluidas.has(o.id)), [universo, incluirSuspeitas, incluidas]);
  // As suspeitas dos filtros atuais, com o custo que teriam (para a lista do fim da página).
  const suspeitasLista = useMemo(
    () =>
      universo
        .filter((o) => o.suspeita)
        .map((o) => ({ o, custo: custoUnitario(o, op), valor: valorDaObra(o, op), dentro: incluirSuspeitas || incluidas.has(o.id) }))
        .sort((a, b) => (b.custo ?? -1) - (a.custo ?? -1)),
    [universo, op, incluirSuspeitas, incluidas]
  );
  const grupos = useMemo(() => agrupar(considerados, op), [considerados, op]);
  const suspeitasFora = universo.length - considerados.length;
  const totalSuspeitas = suspeitasLista.length;
  const comCusto = grupos.reduce((s, g) => s + g.acoes, 0);
  const valorTotal = grupos.reduce((s, g) => s + g.valor, 0);
  const semValor = considerados.length - comCusto;

  const grupo = grupos.find((g) => g.chave === grupoSel) ?? null;
  const obrasDoGrupo = useMemo(() => {
    if (!grupo) return [];
    return considerados
      .filter((o) => `${(o.tipologia ?? "").trim().toUpperCase() || "(SEM TIPOLOGIA)"}|${o.unidade}` === grupo.chave && custoUnitario(o, op) != null)
      .map((o) => ({ o, custo: custoUnitario(o, op) as number, valor: valorDaObra(o, op) as number }))
      .sort((a, b) => b.custo - a.custo);
  }, [considerados, grupo, op]);

  const porAno = useMemo(() => dividir(obrasDoGrupo, (x) => vazio(x.o.anoReceb), true), [obrasDoGrupo]);
  const porRevestimento = useMemo(() => dividir(obrasDoGrupo, (x) => x.o.revestimento), [obrasDoGrupo]);
  const porOrgao = useMemo(() => dividir(obrasDoGrupo, (x) => vazio(x.o.orgao)), [obrasDoGrupo]);
  const maiorMediana = Math.max(1, ...porAno.map((a) => a.est.mediana ?? 0));

  const ativos = Object.entries(selecao).filter(([, v]) => v !== null).length + (busca ? 1 : 0) + (ids ? 1 : 0);
  const totalPaginas = Math.max(1, Math.ceil(obrasDoGrupo.length / PAGINA));
  const paginaOk = Math.min(pagina, totalPaginas);
  const mudarSel = (chave: string) => (v: Set<string> | null) => {
    setSelecao((s) => ({ ...s, [chave]: v }));
    setPagina(1);
  };

  function faixa(custo: number): { rotulo: string; cor: string } {
    if (!grupo || grupo.est.p25 == null || grupo.est.p75 == null) return { rotulo: "-", cor: "text-ink-muted" };
    const iqr = grupo.est.p75 - grupo.est.p25;
    if (custo > grupo.est.p75 + 1.5 * iqr) return { rotulo: "Muito acima", cor: "text-status-critical" };
    if (custo < grupo.est.p25 - 1.5 * iqr) return { rotulo: "Muito abaixo", cor: "text-status-warning" };
    if (custo > grupo.est.p75) return { rotulo: "Acima", cor: "text-status-warning" };
    if (custo < grupo.est.p25) return { rotulo: "Abaixo", cor: "text-ink-secondary" };
    return { rotulo: "Dentro da faixa", cor: "text-status-good" };
  }

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
        setAviso({ tipo: "ok", texto: "Filtro gravado." });
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
        setBase("final");
        setCorrecao(0);
        setIncluirSuspeitas(false);
        setAviso({ tipo: "ok", texto: "Filtro gravado apagado." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  function exportar() {
    const medianas = new Map(grupos.map((g) => [g.chave, g.est.mediana]));
    const colunas = ["ID da Ação", "Link no SIMO", "Nome da Ação", "Órgão", "Tipologia", "Unidade", "Tipo de pavimento", "Tipo de serviço", "Ano de recebimento", "Quantidade", "Valor (base escolhida)", "Custo por unidade", "Mediana do grupo", "Diferença para a mediana (%)", "Suspeita na auditoria"];
    const dados: string[] = [];
    for (const o of considerados) {
      const c = custoUnitario(o, op);
      const v = valorDaObra(o, op);
      if (c == null || v == null) continue;
      const med = medianas.get(`${(o.tipologia ?? "").trim().toUpperCase() || "(SEM TIPOLOGIA)"}|${o.unidade}`) ?? null;
      dados.push([o.id, urlAcaoSimo(o.id), o.nome, o.orgao, o.tipologia, o.unidade, o.revestimento, o.servico, o.anoReceb, String(o.quantidade).replace(".", ","), num2(v), num2(c), num2(med), med ? ((c / med - 1) * 100).toFixed(1).replace(".", ",") : "", o.suspeita ? "Sim" : ""].map(csvEscape).join(";"));
    }
    const csv = "﻿" + [colunas.join(";"), ...dados].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-de-custos-${new Date().toISOString().slice(0, 10)}.csv`;
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-xs font-medium text-status-warning">
          <Info size={15} className="mt-px shrink-0" />
          <span>
            <strong>Como ler:</strong> o custo por unidade é o valor da ação dividido pela quantidade cadastrada (R$ por m², por km, por unidade...), comparado entre obras da <strong>mesma tipologia e unidade</strong>. Usamos <strong>mediana e quartis</strong> (25% a 75% das obras), que não se deixam enganar por um erro de digitação. O custo muda muito com o <strong>tipo de pavimento</strong> (lido do nome da ação) e com o ano, por isso há filtros para isso e uma correção anual opcional. Ações que a auditoria marcou como <strong>suspeitas</strong> (quantidade ou unidade provavelmente errada) ficam <strong>fora da conta</strong>: a lista delas, com o motivo, está no <strong>fim da página</strong>, e lá você inclui todas ou só as que quiser.
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
            Valor usado
            <select value={base} onChange={(e) => setBase(e.target.value as "final" | "contratado")} className={campo}>
              <option value="final">Valor final (com aditivos)</option>
              <option value="contratado">Valor contratado (original)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-secondary" title={`Corrige o valor de cada obra, do ano de recebimento (ou de criação) até ${anoHoje}, por esta taxa ao ano. 0 = valores como estão. Use para comparar obras de anos diferentes.`}>
            Correção ao ano (%)
            <input type="number" min={0} max={50} step={0.5} value={correcao} onChange={(e) => setCorrecao(Math.max(0, Number(e.target.value) || 0))} className={campo + " w-20"} />
          </label>
          <label className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary" title="Por padrão as ações suspeitas ficam fora da conta. Marque para incluir todas. A lista delas está no fim da página.">
            <input type="checkbox" checked={incluirSuspeitas} onChange={(e) => setIncluirSuspeitas(e.target.checked)} className="h-3.5 w-3.5" />
            Incluir na conta as {inteiro(totalSuspeitas)} ações suspeitas
          </label>
          {ativos > 0 && (
            <button onClick={() => { setSelecao({}); setBusca(""); setIds(""); setPagina(1); }} className="text-xs font-medium text-series-1 hover:underline">
              limpar {ativos} filtro(s)
            </button>
          )}
          <button onClick={gravarFiltro} disabled={gravando} className="ml-auto flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Save size={13} /> {gravando ? "Gravando..." : "Gravar filtro"}
          </button>
          <button onClick={exportar} disabled={comCusto === 0} className="flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Download size={13} /> Exportar Excel
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-ink-muted">
          {gravadoEm
            ? alterado
              ? "Você mudou os filtros depois da última gravação. Clique em Gravar filtro para guardar."
              : "Filtro gravado em " + new Date(gravadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (gravadoPor ? " por " + gravadoPor : "") + "."
            : "Nenhum filtro gravado: a tela abre só com a classificação OBRA."}
          {gravadoEm && (
            <button onClick={apagarGravado} disabled={gravando} className="ml-2 font-medium hover:text-ink-primary hover:underline disabled:opacity-50">
              Apagar filtro gravado
            </button>
          )}
          {aviso && <span className={"ml-2 font-medium " + (aviso.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{aviso.texto}</span>}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartao("Ações com custo calculado", inteiro(comCusto), "Têm unidade, quantidade e valor.")}
        {cartao("Valor total das ações", brlCurto(valorTotal), base === "final" ? "Valor final (com aditivos)" : "Valor contratado")}
        {cartao("Suspeitas fora da conta", inteiro(suspeitasFora), incluirSuspeitas ? "Incluídas: a opção está marcada." : "Quantidade ou unidade duvidosa. A lista está no fim da página.", suspeitasFora ? "text-status-warning" : undefined)}
        {cartao("Sem valor para calcular", inteiro(semValor), "Têm quantidade, mas falta o valor da ação.", semValor ? "text-status-warning" : undefined)}
      </section>

      {grupos.length > 0 && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {grupos.slice(0, 6).map((g) => (
            <button key={g.chave} onClick={() => { setGrupoSel(g.chave); setPagina(1); }} className={"rounded-xl border bg-surface p-4 text-left shadow-card hover:bg-plane/50 " + (grupoSel === g.chave ? "border-series-1" : "border-black/5")}>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">{g.tipologia} · R$ por {g.unidade}</p>
              <p className="tabular mt-1 text-xl font-semibold text-series-1">{brl(g.est.mediana)}</p>
              <p className="text-[11px] text-ink-muted">mediana · faixa comum {brl(g.est.p25)} a {brl(g.est.p75)}</p>
              <p className="mt-1 text-[11px] text-ink-secondary">{inteiro(g.acoes)} ação(ões) · {brlCurto(g.valor)}</p>
            </button>
          ))}
        </section>
      )}

      <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">Tipologia</th>
              <th className="px-3 py-2.5">Unidade</th>
              <th className="px-3 py-2.5 text-right">Ações</th>
              <th className="px-3 py-2.5 text-right">Valor total</th>
              <th className="px-3 py-2.5 text-right">Quantidade total</th>
              <th className="px-3 py-2.5 text-right" title="Soma dos valores ÷ soma das quantidades: o custo do conjunto (obras grandes pesam mais).">Ponderado ⓘ</th>
              <th className="px-3 py-2.5 text-right" title="Metade das obras custa menos que isto, metade mais.">Mediana ⓘ</th>
              <th className="px-3 py-2.5 text-right" title="25% das obras custam menos que isto.">25% ⓘ</th>
              <th className="px-3 py-2.5 text-right" title="75% das obras custam menos que isto.">75% ⓘ</th>
              <th className="px-3 py-2.5 text-right">Mínimo</th>
              <th className="px-3 py-2.5 text-right">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.chave} onClick={() => { setGrupoSel(g.chave); setPagina(1); }} className={"cursor-pointer border-b border-black/5 hover:bg-plane/60 " + (grupoSel === g.chave ? "bg-series-1/5" : "")}>
                <td className="px-4 py-2 font-medium text-ink-primary">{g.tipologia}</td>
                <td className="px-3 py-2 text-series-1">{g.unidade}</td>
                <td className="tabular px-3 py-2 text-right">{inteiro(g.acoes)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-secondary">{brlCurto(g.valor)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-secondary">{g.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                <td className="tabular px-3 py-2 text-right">{brl(g.ponderado)}</td>
                <td className="tabular px-3 py-2 text-right font-semibold text-series-1">{brl(g.est.mediana)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-secondary">{brl(g.est.p25)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-secondary">{brl(g.est.p75)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-muted">{brl(g.est.min)}</td>
                <td className="tabular px-3 py-2 text-right text-ink-muted">{brl(g.est.max)}</td>
              </tr>
            ))}
            {grupos.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-ink-muted">Nenhuma ação com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="border-t border-black/5 px-4 py-2 text-[11px] text-ink-muted">Clique numa linha (ou num card) para ver a evolução por ano, por tipo de pavimento, por órgão e a lista de obras com o custo de cada uma.{base === "final" ? "" : " Valor contratado = o original, sem aditivos."}{correcao ? ` Valores corrigidos em ${correcao}% ao ano até ${anoHoje}.` : ""}</p>
      </section>

      {grupo && (
        <>
          <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-primary">
                {grupo.tipologia} · R$ por {grupo.unidade}
              </h2>
              <button onClick={() => setGrupoSel(null)} className="text-xs font-medium text-series-1 hover:underline">fechar detalhe</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-muted">Mediana por ano de recebimento</p>
                <ul className="space-y-1.5">
                  {porAno.map((a) => (
                    <li key={a.chave} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 tabular text-ink-secondary">{a.chave}</span>
                      <span className="h-3 flex-1 rounded bg-black/5">
                        <span className="block h-3 rounded bg-series-1" style={{ width: `${((a.est.mediana ?? 0) / maiorMediana) * 100}%` }} />
                      </span>
                      <span className="tabular w-28 shrink-0 text-right text-ink-primary">{brl(a.est.mediana)}</span>
                      <span className="w-12 shrink-0 text-right text-[11px] text-ink-muted">{inteiro(a.est.n)} obra(s)</span>
                    </li>
                  ))}
                </ul>
              </div>
              <TabelaDivisao titulo="Por tipo de pavimento (do nome)" linhas={porRevestimento} mediana={grupo.est.mediana} />
              <TabelaDivisao titulo="Por órgão" linhas={porOrgao} mediana={grupo.est.mediana} />
            </div>
          </section>

          <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Ação</th>
                  <th className="px-3 py-2.5">Pavimento</th>
                  <th className="px-3 py-2.5">Recebida</th>
                  <th className="px-3 py-2.5 text-right">Quantidade</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-right">R$ por {grupo.unidade}</th>
                  <th className="px-3 py-2.5 text-right">vs. mediana</th>
                  <th className="px-3 py-2.5">Posição</th>
                </tr>
              </thead>
              <tbody>
                {obrasDoGrupo.slice((paginaOk - 1) * PAGINA, paginaOk * PAGINA).map(({ o, custo, valor }) => {
                  const f = faixa(custo);
                  const dif = grupo.est.mediana ? (custo / grupo.est.mediana - 1) * 100 : null;
                  return (
                    <tr key={o.id} className="border-b border-black/5 hover:bg-plane/40">
                      <td className="whitespace-nowrap px-4 py-2"><IdAcaoLink id={o.id} /></td>
                      <td className="max-w-[320px] px-3 py-2">
                        <div className="line-clamp-2 text-ink-primary" title={o.nome}>{o.nome}</div>
                        <div className="text-[11px] text-ink-muted">{o.orgao ?? "-"}{o.suspeita ? " · suspeita na auditoria" : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{o.revestimento}</td>
                      <td className="tabular px-3 py-2 text-ink-secondary">{o.anoReceb ?? "-"}</td>
                      <td className="tabular px-3 py-2 text-right text-series-1">{o.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-secondary">{brl(valor)}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{brl(custo)}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-secondary">{dif == null ? "-" : (dif > 0 ? "+" : "") + dif.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%"}</td>
                      <td className={"whitespace-nowrap px-3 py-2 font-medium " + f.cor}>{f.rotulo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
              <span>{inteiro(obrasDoGrupo.length)} obra(s) · página {paginaOk} de {totalPaginas} · do mais caro para o mais barato</span>
              <span className="flex gap-2">
                <button disabled={paginaOk <= 1} onClick={() => setPagina(paginaOk - 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
                <button disabled={paginaOk >= totalPaginas} onClick={() => setPagina(paginaOk + 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Próxima</button>
              </span>
            </div>
          </section>
        </>
      )}
      <section id="suspeitas" className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <div className="border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-primary">Ações suspeitas ({inteiro(totalSuspeitas)})</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            A auditoria desconfia da quantidade ou da unidade destas ações, então o custo por unidade delas pode estar errado. Por padrão ficam <strong>fora da conta</strong>. Use “Incluir na conta” para as que você achar certas, ou a caixa lá em cima para incluir todas. Para tirar de vez do alerta, marque como <strong>Ignorar</strong> na Nova análise em teste: aí ela passa a valer sempre.
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">ID</th>
              <th className="px-3 py-2.5">Ação</th>
              <th className="px-3 py-2.5">Tipologia</th>
              <th className="px-3 py-2.5">Unidade</th>
              <th className="px-3 py-2.5 text-right">Quantidade</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5 text-right">R$ por unidade</th>
              <th className="px-3 py-2.5">Por que é suspeita</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {suspeitasLista.slice((Math.min(paginaSusp, Math.max(1, Math.ceil(totalSuspeitas / PAGINA))) - 1) * PAGINA, Math.min(paginaSusp, Math.max(1, Math.ceil(totalSuspeitas / PAGINA))) * PAGINA).map(({ o, custo, valor, dentro }) => (
              <tr key={o.id} className="border-b border-black/5 align-top hover:bg-plane/40">
                <td className="whitespace-nowrap px-4 py-2.5"><IdAcaoLink id={o.id} /></td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <div className="line-clamp-2 text-ink-primary" title={o.nome}>{o.nome}</div>
                  <div className="text-[11px] text-ink-muted">{o.orgao ?? "-"}</div>
                </td>
                <td className="px-3 py-2.5 text-ink-secondary">{o.tipologia ?? "-"}</td>
                <td className="px-3 py-2.5 text-series-1">{o.unidade}</td>
                <td className="tabular px-3 py-2.5 text-right text-series-1">{o.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                <td className="tabular px-3 py-2.5 text-right text-ink-secondary">{brl(valor)}</td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">{brl(custo)}</td>
                <td className="min-w-[320px] px-3 py-2.5 text-ink-secondary">
                  <ul className="space-y-1">
                    {o.motivos.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {incluirSuspeitas ? (
                    <span className="text-[11px] text-ink-muted">incluída (caixa do topo)</span>
                  ) : dentro ? (
                    <button onClick={() => setIncluidas((s) => { const n = new Set(s); n.delete(o.id); return n; })} className="rounded-full border border-series-1 px-2.5 py-1 text-[11px] font-medium text-series-1 hover:bg-series-1/10">Na conta · tirar</button>
                  ) : (
                    <button onClick={() => setIncluidas((s) => new Set(s).add(o.id))} className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:bg-plane">Incluir na conta</button>
                  )}
                </td>
              </tr>
            ))}
            {totalSuspeitas === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink-muted">Nenhuma ação suspeita com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
        {totalSuspeitas > PAGINA && (
          <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
            <span>Página {Math.min(paginaSusp, Math.ceil(totalSuspeitas / PAGINA))} de {Math.ceil(totalSuspeitas / PAGINA)} · do maior para o menor custo por unidade</span>
            <span className="flex gap-2">
              <button disabled={paginaSusp <= 1} onClick={() => setPaginaSusp(paginaSusp - 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
              <button disabled={paginaSusp >= Math.ceil(totalSuspeitas / PAGINA)} onClick={() => setPaginaSusp(paginaSusp + 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Próxima</button>
            </span>
          </div>
        )}
      </section>

      <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
        <AlertTriangle size={12} className="mt-px shrink-0" />
        Valores correntes (o que está cadastrado), sem tabela de referência externa (SINAPI/SICRO): a comparação é entre as obras do próprio Piauí. A faixa “Muito acima/abaixo” usa a regra dos quartis (fora de 1,5× a distância entre 25% e 75%).
      </p>
    </div>
  );
}

type ItemCusto = { o: ObraCusto; custo: number; valor: number };
function dividir(itens: ItemCusto[], chave: (x: ItemCusto) => string, ordenarPorChave = false): { chave: string; est: ReturnType<typeof estatistica> }[] {
  const m = new Map<string, number[]>();
  for (const x of itens) (m.get(chave(x)) ?? m.set(chave(x), []).get(chave(x))!).push(x.custo);
  const out = Array.from(m, ([k, v]) => ({ chave: k, est: estatistica(v) }));
  return ordenarPorChave ? out.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR", { numeric: true })) : out.sort((a, b) => b.est.n - a.est.n);
}

function TabelaDivisao({ titulo, linhas, mediana }: { titulo: string; linhas: { chave: string; est: ReturnType<typeof estatistica> }[]; mediana: number | null }) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-muted">{titulo}</p>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-xs">
          <tbody>
            {linhas.map((l) => {
              const dif = mediana && l.est.mediana ? (l.est.mediana / mediana - 1) * 100 : null;
              return (
                <tr key={l.chave} className="border-b border-black/5 last:border-0">
                  <td className="py-1 pr-2 text-ink-primary">{l.chave}</td>
                  <td className="tabular py-1 pr-2 text-right text-ink-muted">{inteiro(l.est.n)}</td>
                  <td className="tabular py-1 pr-2 text-right font-medium">{brl(l.est.mediana)}</td>
                  <td className="tabular py-1 text-right text-[11px] text-ink-muted">{dif == null ? "" : (dif > 0 ? "+" : "") + dif.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

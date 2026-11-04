"use client";

import "leaflet/dist/leaflet.css";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import type { Map as MapaDoLeaflet } from "leaflet";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";
import { COR_TERRITORIO, SEM_TERRITORIO, rotuloTerritorio } from "@/lib/territorios";
import {
  FILTROS,
  aditivada,
  anoDeCriacao,
  anoDeRecebimento,
  cruza,
  descricaoDosTerritorios,
  estadoPadrao,
  filtrar,
  principal,
  resumoPorTerritorio,
  valoresDosFiltros,
  valorFinal,
  vinculada,
  type AcaoT,
  type EstadoFiltros,
  type LinhaTerritorio,
} from "@/lib/analiseTerritorio";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";
const TAMANHO = 50;

type Aba = "resumo" | "mapa" | "lista" | "cruzam";
const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "resumo", rotulo: "Resumo por território" },
  { chave: "mapa", rotulo: "Mapa dos territórios" },
  { chave: "lista", rotulo: "Lista de ações" },
  { chave: "cruzam", rotulo: "Cruzam territórios" },
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AnaliseTerritorio({ acoes, territorios }: { acoes: AcaoT[]; territorios: string[] }) {
  const [estado, setEstado] = useState<EstadoFiltros>(() => estadoPadrao());
  const [aba, setAba] = useState<Aba>("resumo");
  const [pagina, setPagina] = useState(1);

  const valores = useMemo(() => valoresDosFiltros(acoes), [acoes]);
  const filtradas = useMemo(() => filtrar(acoes, estado), [acoes, estado]);
  const resumo = useMemo(() => resumoPorTerritorio(filtradas, territorios), [filtradas, territorios]);
  const cruzam = useMemo(() => filtradas.filter(cruza), [filtradas]);

  const mudar = (e: EstadoFiltros) => {
    setEstado(e);
    setPagina(1);
  };
  const ativos = FILTROS.filter((f) => estado.selecao[f.chave] !== null).length + (estado.pctMinimo != null ? 1 : 0) + (estado.busca ? 1 : 0) + (estado.ids.trim() ? 1 : 0);
  const filtrarTerritorio = (rotulo: string) => {
    mudar({ ...estado, selecao: { ...estado.selecao, territorio: new Set([rotulo]) } });
    setAba("lista");
  };

  function exportar() {
    const lista = aba === "cruzam" ? cruzam : filtradas;
    const colunas = ["ID da Ação", "Nome da Ação", "Órgão", "Status", "Estágio Atual", "Território principal", "Territórios (% do traçado)", "Localizada por", "Extensão (km)", "Vinculação SIAFE", "SIAFE automático", "% Execução", "Ano de criação", "Ano de recebimento", "Valor original", "Valor final"];
    const linhas = lista.map((a) =>
      [
        a.id,
        a.nome,
        a.orgao,
        a.status,
        a.estagio,
        rotuloTerritorio(principal(a)),
        descricaoDosTerritorios(a),
        a.origem === "tracado" ? "Traçado" : a.origem === "municipio" ? "Município do SIMO" : "Sem localização",
        a.extensaoM ? (a.extensaoM / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "",
        vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número",
        a.numeroAutomatico,
        a.pct != null ? (a.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "",
        anoDeCriacao(a),
        anoDeRecebimento(a),
        a.original ?? "",
        a.original != null || a.total != null ? valorFinal(a) : "",
      ]
        .map(csvEscape)
        .join(";")
    );
    const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `analise-por-territorio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="text-xs text-ink-muted">
          Cada ação entra no território onde cai a maior parte do traçado (o mesmo cálculo da Verificação de bairros). Sem traçado, vale o município informado no SIMO. Uma ação
          &quot;passa&quot; por todo território com pelo menos 5% do traçado.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTROS.filter((f) => f.chave !== "id").map((f) => (
            <FiltroCheckbox key={f.chave} rotulo={f.rotulo} opcoes={valores[f.chave] ?? []} selecionados={estado.selecao[f.chave]} aoMudar={(v) => mudar({ ...estado, selecao: { ...estado.selecao, [f.chave]: v } })} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input value={estado.busca} onChange={(e) => mudar({ ...estado, busca: e.target.value })} placeholder="Buscar ID, nome ou órgão..." className={campo + " w-64"} />
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Execução mínima (%)
            <input
              type="number"
              min={0}
              max={100}
              value={estado.pctMinimo ?? ""}
              onChange={(e) => mudar({ ...estado, pctMinimo: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
              className={campo + " w-20"}
            />
          </label>
          <input value={estado.ids} onChange={(e) => mudar({ ...estado, ids: e.target.value })} placeholder="Só estes IDs (cole vários)..." className={campo + " w-64"} />
          {ativos > 0 && (
            <button onClick={() => mudar(estadoPadrao())} className="text-xs font-medium text-series-1 hover:underline">
              limpar {ativos} filtro(s)
            </button>
          )}
          <button onClick={exportar} disabled={filtradas.length === 0} className="ml-auto flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Download size={13} /> Exportar Excel
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(acoes.length)} ação(ões) · {inteiro(resumo.geral.vinculadas)} vinculada(s) · {inteiro(resumo.geral.naoVinculadas)} não vinculada(s) ·{" "}
          {inteiro(cruzam.length)} cruzam territórios
        </p>
      </section>

      <nav className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            onClick={() => setAba(a.chave)}
            className={"flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold " + (aba === a.chave ? "bg-series-1 text-white" : "bg-surface text-ink-secondary hover:bg-plane")}
          >
            {a.rotulo}
            {a.chave === "cruzam" && <span className={"tabular rounded-full px-1.5 py-0.5 text-[10px] " + (aba === a.chave ? "bg-white/25" : "bg-black/5")}>{inteiro(cruzam.length)}</span>}
          </button>
        ))}
      </nav>

      {aba === "resumo" && <Resumo linhas={resumo.linhas} geral={resumo.geral} aoEscolher={filtrarTerritorio} />}
      {aba === "mapa" && <MapaTerritorios linhas={resumo.linhas} aoEscolher={filtrarTerritorio} />}
      {aba === "lista" && <ListaAcoes acoes={filtradas} pagina={pagina} aoMudarPagina={setPagina} />}
      {aba === "cruzam" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">Ações cujo traçado passa por mais de um território (pelo menos 5% em cada). Servem para conferir o enquadramento e dividir a análise.</p>
          <ListaAcoes acoes={cruzam} pagina={pagina} aoMudarPagina={setPagina} />
        </div>
      )}
    </div>
  );
}

// ---------- resumo ----------

function Resumo({ linhas, geral, aoEscolher }: { linhas: LinhaTerritorio[]; geral: LinhaTerritorio; aoEscolher: (rotulo: string) => void }) {
  const maior = Math.max(1, ...linhas.map((l) => l.acoes));
  return (
    <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2.5">Território</th>
            <th className="px-3 py-2.5 text-right">Ações</th>
            <th className="px-3 py-2.5 text-right" title="Ações de outro território que também passam por este">
              Também passam
            </th>
            <th className="px-3 py-2.5 text-right">Vinculadas</th>
            <th className="px-3 py-2.5 text-right">Não vinculadas</th>
            <th className="px-3 py-2.5 text-right">Com recebimento</th>
            <th className="px-3 py-2.5 text-right">Aditivadas</th>
            <th className="px-3 py-2.5 text-right">Valor contratado</th>
            <th className="px-3 py-2.5 text-right">Valor final</th>
            <th className="px-3 py-2.5 text-right" title="Quilômetros de traçado dentro do território">
              Traçado (km)
            </th>
            <th className="px-3 py-2.5 text-right">Com traçado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.territorio} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
              <td className="px-4 py-2">
                <button onClick={() => aoEscolher(rotuloTerritorio(l.territorio))} className="flex items-center gap-2 font-medium text-ink-primary hover:underline" title="Ver as ações deste território">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_TERRITORIO[l.territorio] ?? "#6b7280" }} />
                  {rotuloTerritorio(l.territorio)}
                </button>
                <div className="mt-1 h-1 rounded bg-black/5">
                  <div className="h-1 rounded" style={{ width: `${(l.acoes / maior) * 100}%`, background: COR_TERRITORIO[l.territorio] ?? "#6b7280" }} />
                </div>
              </td>
              <Numeros l={l} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 bg-plane font-semibold text-ink-primary">
            <td className="px-4 py-2.5">Total</td>
            <Numeros l={geral} total />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Numeros({ l, total }: { l: LinhaTerritorio; total?: boolean }) {
  const c = "tabular px-3 py-2 text-right text-ink-secondary" + (total ? " font-semibold text-ink-primary" : "");
  return (
    <>
      <td className={c}>{inteiro(l.acoes)}</td>
      <td className={c}>{total ? "-" : inteiro(l.tambemPassam)}</td>
      <td className={c}>{inteiro(l.vinculadas)}</td>
      <td className={c + (l.naoVinculadas > 0 && !total ? " text-status-critical" : "")}>{inteiro(l.naoVinculadas)}</td>
      <td className={c}>{inteiro(l.comRecebimento)}</td>
      <td className={c}>{inteiro(l.aditivadas)}</td>
      <td className={c}>{dinheiro(l.original)}</td>
      <td className={c}>{dinheiro(l.total)}</td>
      <td className={c}>{l.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
      <td className={c}>{inteiro(l.comTracado)}</td>
    </>
  );
}

// ---------- lista ----------

function ListaAcoes({ acoes, pagina, aoMudarPagina }: { acoes: AcaoT[]; pagina: number; aoMudarPagina: (p: number) => void }) {
  const totalPaginas = Math.max(1, Math.ceil(acoes.length / TAMANHO));
  const atual = Math.min(pagina, totalPaginas);
  const visiveis = acoes.slice((atual - 1) * TAMANHO, atual * TAMANHO);
  return (
    <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2.5">ID</th>
            <th className="px-3 py-2.5">Ação</th>
            <th className="px-3 py-2.5">Órgão</th>
            <th className="px-3 py-2.5">Território(s)</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Vinculação</th>
            <th className="px-3 py-2.5 text-right">Exec.</th>
            <th className="px-3 py-2.5">Criada</th>
            <th className="px-3 py-2.5">Recebida</th>
            <th className="px-3 py-2.5 text-right">Valor final</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-ink-muted">
                Nenhuma ação com os filtros atuais.
              </td>
            </tr>
          )}
          {visiveis.map((a) => (
            <tr key={a.id} className="border-b border-black/5 last:border-0 align-top hover:bg-plane/60">
              <td className="whitespace-nowrap px-4 py-2">
                <IdAcaoLink id={a.id} />
              </td>
              <td className="max-w-xs px-3 py-2 text-ink-primary">
                {a.nome}
                {aditivada(a) && <span className="ml-1.5 rounded bg-status-warning-bg px-1.5 py-0.5 text-[10px] text-status-warning">aditivada</span>}
              </td>
              <td className="px-3 py-2 text-ink-secondary">{a.orgao ?? "-"}</td>
              <td className="px-3 py-2 text-ink-secondary">
                {a.partes.length === 0 ? (
                  <span className="text-ink-muted">{rotuloTerritorio(SEM_TERRITORIO)}</span>
                ) : (
                  <ul className="space-y-0.5">
                    {a.partes.map((p) => (
                      <li key={p.nome} className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_TERRITORIO[p.nome] ?? "#6b7280" }} />
                        {rotuloTerritorio(p.nome)} <span className="text-ink-muted">{Math.round(p.pct * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                {a.origem === "municipio" && <span className="text-[10px] text-ink-muted">pelo município do SIMO</span>}
              </td>
              <td className="px-3 py-2 text-ink-secondary">{a.status ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (vinculada(a) ? "bg-status-good-bg text-status-good" : a.numeroSiafe ? "bg-status-warning-bg text-status-warning" : "bg-status-critical/10 text-status-critical")}>
                  {vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número"}
                </span>
              </td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{a.pct != null ? `${(a.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%` : "-"}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-ink-secondary">{anoDeCriacao(a) === "(vazio)" ? "-" : anoDeCriacao(a)}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-ink-secondary">{anoDeRecebimento(a) === "(vazio)" ? "-" : anoDeRecebimento(a)}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{a.original != null || a.total != null ? dinheiro(valorFinal(a)) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-black/5 px-4 py-2.5 text-xs text-ink-muted">
        <span>
          {inteiro(acoes.length)} ação(ões) · página {atual} de {totalPaginas}
        </span>
        <span className="flex gap-2">
          <button disabled={atual <= 1} onClick={() => aoMudarPagina(atual - 1)} className="rounded-full border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
            Anterior
          </button>
          <button disabled={atual >= totalPaginas} onClick={() => aoMudarPagina(atual + 1)} className="rounded-full border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
            Próxima
          </button>
        </span>
      </div>
    </section>
  );
}

// ---------- mapa ----------

type DadosMapaTerritorios = {
  territorios: { nome: string; linhas: [number, number][][] }[];
  municipios: { nome: string; territorio: string; aneis: [number, number][][] }[];
};

class ContemErro extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  componentDidCatch(e: unknown) {
    console.error("mapa de territórios:", e);
  }
  render() {
    if (this.state.erro) return <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Não foi possível desenhar o mapa. Recarregue a página.</p>;
    return this.props.children;
  }
}

function MapaTerritorios({ linhas, aoEscolher }: { linhas: LinhaTerritorio[]; aoEscolher: (rotulo: string) => void }) {
  const [dados, setDados] = useState<DadosMapaTerritorios | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    (async () => {
      try {
        const resp = await fetch("/api/territorios/mapa", { signal: controle.signal });
        const json = (await resp.json().catch(() => null)) as (DadosMapaTerritorios & { error?: string }) | null;
        if (!resp.ok) setErro(json?.error ?? `Não foi possível carregar o mapa (${resp.status}).`);
        else if (!json || !Array.isArray(json.territorios) || !Array.isArray(json.municipios)) setErro("Resposta inesperada do servidor. Recarregue a página (Ctrl+F5).");
        else setDados(json);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setErro("Sem conexão com o servidor.");
      }
    })();
    return () => controle.abort();
  }, []);

  if (erro) return <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erro}</p>;
  if (!dados)
    return (
      <p className="flex items-center gap-2 py-10 text-xs text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> Carregando o mapa...
      </p>
    );
  return (
    <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <ContemErro>
        <MapaLeaflet dados={dados} linhas={linhas} aoEscolher={aoEscolher} />
      </ContemErro>
      <ul className="mt-3 flex flex-wrap gap-2">
        {linhas
          .filter((l) => l.territorio !== SEM_TERRITORIO)
          .map((l) => (
            <li key={l.territorio}>
              <button onClick={() => aoEscolher(rotuloTerritorio(l.territorio))} className="flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 text-xs text-ink-secondary hover:bg-plane">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_TERRITORIO[l.territorio] ?? "#6b7280" }} />
                {rotuloTerritorio(l.territorio)}: <strong className="font-semibold">{inteiro(l.acoes)}</strong>
              </button>
            </li>
          ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">Clique num território (no mapa ou na legenda) para ver as ações dele. O número é de ações com o filtro atual.</p>
    </section>
  );
}

function MapaLeaflet({ dados, linhas, aoEscolher }: { dados: DadosMapaTerritorios; linhas: LinhaTerritorio[]; aoEscolher: (rotulo: string) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;
  const porTerritorio = useMemo(() => new Map(linhas.map((l) => [l.territorio, l])), [linhas]);
  useEffect(() => {
    let mapa: MapaDoLeaflet | null = null;
    let cancelado = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelado || !divRef.current) return;
      mapa = L.map(divRef.current);
      mapa.setView([-7.5, -43], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(mapa);
      const grupo = L.featureGroup().addTo(mapa);
      for (const m of dados.municipios) {
        const cor = COR_TERRITORIO[m.territorio] ?? "#6b7280";
        const l = porTerritorio.get(m.territorio);
        for (const anel of m.aneis) {
          if (!Array.isArray(anel) || anel.length < 3) continue;
          L.polygon(anel, { color: cor, weight: 0.4, opacity: 0.6, fillColor: cor, fillOpacity: 0.28 })
            .bindTooltip(`${m.nome} - ${rotuloTerritorio(m.territorio)}${l ? `: ${inteiro(l.acoes)} ação(ões)` : ""}`, { sticky: true })
            .on("click", () => escolher.current(rotuloTerritorio(m.territorio)))
            .addTo(grupo);
        }
      }
      // Contorno tracejado de cada território.
      for (const t of dados.territorios) {
        const cor = COR_TERRITORIO[t.nome] ?? "#374151";
        for (const l of t.linhas) {
          if (l.length < 2) continue;
          L.polyline(l, { color: cor, weight: 3, dashArray: "8 6", opacity: 0.95, interactive: false }).addTo(grupo);
        }
      }
      const bounds = grupo.getBounds();
      const enquadrar = () => {
        if (cancelado || !mapa) return;
        mapa.invalidateSize();
        try {
          if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [20, 20] });
        } catch (e) {
          console.error("mapa de territórios (enquadrar):", e);
        }
      };
      enquadrar();
      setTimeout(enquadrar, 200);
    })();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [dados, porTerritorio]);
  return <div ref={divRef} className="h-[34rem] w-full overflow-hidden rounded-lg border border-black/5" />;
}

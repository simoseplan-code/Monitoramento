"use client";

import "leaflet/dist/leaflet.css";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Download, Info, Loader2, MapPinned, Maximize2, Minimize2, RefreshCw, Save, X } from "lucide-react";
import type { Map as MapaDoLeaflet } from "leaflet";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { dataBR } from "@/lib/acoesFiltro";
import { adicionarBases } from "@/lib/mapaBase";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";
import { AtualizarBairros } from "@/components/AtualizarBairros";
import { JanelaMapa } from "@/app/verificacao-bairros/VerificacaoBairros";
import { COR_TERRITORIO, SEM_TERRITORIO, corDoStatus, normalizarNome, rotuloTerritorio } from "@/lib/territorios";
import { grupoDaTipologia, htmlMarcador, svgSimbolo, type GrupoTipologia } from "@/lib/tipologiaMapa";
import {
  FILTROS,
  aditivada,
  valorFinal,
  anoDeCriacao,
  anoDeRecebimento,
  cruza,
  descreverFiltros,
  descricaoDosMunicipios,
  descricaoDosTerritorios,
  estadoDeGravado,
  estadoParaGravar,
  estadoPadrao,
  estadoTodos,
  filtrar,
  principal,
  resumoPassagem,
  resumoPorMunicipio,
  resumoPorTerritorio,
  valoresDosFiltros,
  vinculada,
  type AcaoT,
  type EstadoFiltros,
  type LinhaTerritorio,
} from "@/lib/analiseTerritorio";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";
const TAMANHO = 50;

type Aba = "resumo" | "municipios" | "mapa" | "tracados" | "lista" | "cruzam";
const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "resumo", rotulo: "Resumo por território" },
  { chave: "municipios", rotulo: "Resumo por município" },
  { chave: "mapa", rotulo: "Mapa dos territórios" },
  { chave: "tracados", rotulo: "Mapa de KML (traçados)" },
  { chave: "lista", rotulo: "Lista de ações" },
  { chave: "cruzam", rotulo: "Cruzam territórios" },
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function CorpoAnalise({ visao = "kml", acoes, territorios, territorioDoMunicipio = {}, filtroGravado, ehAdmin, modo = "analise", tela = "analise_territorio", somenteLeitura = false }: { visao?: "kml" | "simo"; territorioDoMunicipio?: Record<string, string>; acoes: AcaoT[]; territorios: string[]; ehAdmin: boolean; modo?: "analise" | "mapa" | "hidricos"; tela?: string; somenteLeitura?: boolean; filtroGravado: { estado: unknown; atualizadoEm: string; por?: string | null } | null }) {
  const valores = useMemo(() => valoresDosFiltros(acoes), [acoes]);
  // Abre no filtro gravado (um só, vale para todos os usuários); sem filtro gravado, abre só com as vinculadas.
  const [estado, setEstado] = useState<EstadoFiltros>(() => (filtroGravado ? estadoDeGravado(filtroGravado.estado, valores) : modo === "hidricos" ? estadoTodos() : estadoPadrao()));
  const [gravadoEm, setGravadoEm] = useState<string | null>(filtroGravado?.atualizadoEm ?? null);
  const [gravadoPor, setGravadoPor] = useState<string | null>(filtroGravado?.por ?? null);
  const [gravadoJson, setGravadoJson] = useState<string | null>(filtroGravado ? JSON.stringify(estadoParaGravar(estadoDeGravado(filtroGravado.estado, valores))) : null);
  const [gravando, setGravando] = useState(false);
  // Excel: com ou sem o percentual do traçado em cada município e território.
  const [comPct, setComPct] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [aba, setAba] = useState<Aba>(modo === "analise" ? "resumo" : "tracados");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => filtrar(acoes, estado), [acoes, estado]);
  const resumo = useMemo(() => resumoPorTerritorio(filtradas, territorios), [filtradas, territorios]);
  const passagem = useMemo(() => resumoPassagem(filtradas, territorios), [filtradas, territorios]);
  const porMunicipio = useMemo(() => resumoPorMunicipio(filtradas, territorioDoMunicipio), [filtradas, territorioDoMunicipio]);
  const cruzam = useMemo(() => filtradas.filter(cruza), [filtradas]);

  const mudar = (e: EstadoFiltros) => {
    setEstado(e);
    setPagina(1);
  };
  const ativos = FILTROS.filter((f) => estado.selecao[f.chave] !== null).length + (estado.pctMinimo != null ? 1 : 0) + (estado.busca ? 1 : 0) + (estado.ids.trim() ? 1 : 0);
  const filtrarTerritorio = (rotulo: string) => {
    mudar({ ...estado, selecao: { ...estado.selecao, passa: new Set([rotulo]) } });
    setAba("lista");
  };

  // Clique num município do resumo: filtra a lista por ele (todas as grafias, SIMO e KML).
  const filtrarMunicipio = (chave: string) => {
    const nomes = (valores.municipio ?? []).map((v) => v.valor).filter((v) => normalizarNome(v) === chave);
    mudar({ ...estado, selecao: { ...estado.selecao, municipio: new Set(nomes) } });
    setAba("lista");
  };

  const jsonAtual = JSON.stringify(estadoParaGravar(estado));
  const alterado = gravadoJson !== null && gravadoJson !== jsonAtual;

  async function gravarFiltro() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tela, estado: estadoParaGravar(estado) }) });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; atualizadoEm?: string };
      if (!resp.ok) setAviso({ tipo: "erro", texto: json.error ?? "Não foi possível gravar o filtro." });
      else {
        setGravadoEm(json.atualizadoEm ?? new Date().toISOString());
        setGravadoPor("você");
        setGravadoJson(jsonAtual);
        setAviso({ tipo: "ok", texto: "Filtro gravado para todos os usuários. Quem abrir esta tela já vê esse filtro." });
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
      const resp = await fetch(`/api/filtros?tela=${tela}`, { method: "DELETE" });
      if (!resp.ok) setAviso({ tipo: "erro", texto: "Não foi possível apagar o filtro gravado." });
      else {
        setGravadoEm(null);
        setGravadoPor(null);
        setGravadoJson(null);
        mudar(estadoPadrao());
        setAviso({ tipo: "ok", texto: "Filtro gravado apagado para todos. A tela volta a abrir só com as vinculadas." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  function exportar() {
    const lista = aba === "cruzam" ? cruzam : filtradas;
    const colunas = ["ID da Ação", "Nome da Ação", "Órgão", "Tipologia", "Unidade de medida", "Quantidade", "Município(s)", "Município SIMO", "Território SIMO", "Status", "Estágio Atual", "Território principal", (comPct ? "Territórios (% do traçado)" : "Territórios"), "Localizada por", "Extensão (km)", "Vinculação SIAFE", "SIAFE automático", "% Execução", "Ano de criação", "Ano de recebimento", "Valor contratado", "Valor pago total"];
    const linhas = lista.map((a) =>
      [
        a.id,
        a.nome,
        a.orgao,
        a.tipologia,
        a.unidade,
        a.quantidade != null ? a.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "",
        a.municipios.length ? descricaoDosMunicipios(a, comPct) : "",
        // Sem repetição: "PIRACURUCA - PIRACURUCA" vira "PIRACURUCA".
        a.simoMunicipiosLista.map((m) => m.nome).join(" - "),
        a.simoTerritoriosLista.join(" - "),
        a.status,
        a.estagio,
        rotuloTerritorio(principal(a)),
        descricaoDosTerritorios(a, comPct),
        a.origem === "tracado" ? "Traçado" : a.origem === "municipio" ? "Município do SIMO" : "Sem localização",
        a.extensaoM ? (a.extensaoM / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "",
        vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número",
        a.numeroAutomatico,
        a.pct != null ? (a.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "",
        anoDeCriacao(a),
        anoDeRecebimento(a),
        a.original ?? "",
        a.pago ?? "",
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
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-xs font-medium text-status-warning">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <span>
            {visao === "simo" ? (
              <>
                <strong>Atenção:</strong> esta visão analisa só as ações SEM KML anexado (sem localização por traçado), pelos dados de município e território informados no SIMO. Quando o KML é anexado, a ação sai daqui e passa para a análise por KML.
              </>
            ) : (
              <>
                <strong>Atenção:</strong> esta tela é focada na análise de KML. Os dados de município e território são calculados a partir do KML anexado à ação.
              </>
            )}
          </span>
        </p>
        <p className="text-xs text-ink-muted">
          {visao === "simo" ? "Aqui os municípios e territórios são DADOS DO SIMO (colunas Localização município e território do relatório), não do KML: a ação não tem KML anexado. Quando o SIMO traz mais de um (separados por \" - \"), a ação aparece em todos, dividida em partes iguais." : "Cada ação entra no território onde cai a maior parte do traçado (o mesmo cálculo da Verificação de bairros). Sem traçado, vale o município informado no SIMO. Se o traçado cai em mais de um território, a ação aparece em todos eles (mesmo que seja só uma parte), com a % de cada um."}
        </p>
        {!somenteLeitura && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-plane px-3 py-2">
          <p className="text-xs text-ink-secondary">
            <strong className="text-status-critical">{inteiro(acoes.filter((a) => vinculada(a) && a.origem !== "tracado").length)}</strong> ação(ões) vinculada(s) estão sem traçado (de {inteiro(acoes.filter(vinculada).length)} vinculadas).
          </p>
          <AtualizarBairros ehAdmin={ehAdmin} />
        </div>
        )}
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
            <button onClick={() => mudar(estadoTodos())} className="text-xs font-medium text-series-1 hover:underline" title="Tira todos os filtros (inclusive o de vinculadas)">
              limpar {ativos} filtro(s)
            </button>
          )}
          {!somenteLeitura && (
          <button
            onClick={gravarFiltro}
            disabled={gravando}
            title="Grava os filtros atuais para TODOS os usuários: ao abrir esta tela, qualquer pessoa já os vê aplicados"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save size={13} /> {gravando ? "Gravando..." : "Gravar filtro"}
          </button>
          )}
          <button onClick={exportar} disabled={filtradas.length === 0} className={(somenteLeitura ? "ml-auto " : "") + "flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"}>
            <Download size={13} /> Exportar Excel
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted" title="Marcado: mostra a parte do traçado em cada município e território (ex.: Jurema 70%, Anísio de Abreu 30%) nas listas, no Excel e no PDF. Desmarcado: só os nomes.">
            <input type="checkbox" checked={comPct} onChange={(e) => setComPct(e.target.checked)} className="h-3.5 w-3.5" />
            mostrar % do traçado (listas, Excel e PDF)
          </label>
        </div>
        {!somenteLeitura && (
        <p className="mt-3 text-[11px] leading-snug text-ink-muted">
          {gravadoEm
            ? alterado
              ? "Você mudou os filtros depois da última gravação. Clique em Gravar filtro para guardar (vale para todos)."
              : "Filtro gravado em " + new Date(gravadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (gravadoPor ? " por " + gravadoPor : "") + ". Vale para todos os usuários: é ele que abre para todo mundo."
            : "Nenhum filtro gravado: a tela abre só com as ações vinculadas. Ao gravar, o filtro vale para todos os usuários."}
          {gravadoEm && (
            <button onClick={apagarFiltroGravado} disabled={gravando} className="ml-2 font-medium hover:text-ink-primary hover:underline disabled:opacity-50">
              Apagar filtro gravado (para todos)
            </button>
          )}
          {aviso && <span className={"ml-2 font-medium " + (aviso.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{aviso.texto}</span>}
        </p>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(acoes.length)} ação(ões) · {inteiro(resumo.geral.vinculadas)} vinculada(s) · {inteiro(resumo.geral.naoVinculadas)} não vinculada(s) ·{" "}
          {inteiro(cruzam.length)} cruzam territórios
        </p>
      </section>

      <nav className={"flex flex-wrap gap-2" + (modo !== "analise" ? " hidden" : "")}>
        {ABAS.filter((a) => (a.chave !== "tracados" || ehAdmin) && !(visao === "simo" && (a.chave === "tracados" || a.chave === "cruzam"))).map((a) => (
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

      {(aba === "resumo" || aba === "municipios") && (
        <CartoesResumo
          acoes={filtradas}
          doSimo={visao === "simo"}
          divisao={aba === "resumo" ? { rotulo: "Territórios com ação", qtd: passagem.linhas.filter((l) => l.acoes > 0 && l.territorio !== SEM_TERRITORIO).length } : { rotulo: "Municípios com ação", qtd: porMunicipio.linhas.filter((l) => l.acoes > 0).length }}
        />
      )}
      {aba === "resumo" && <ResumoPassagem r={passagem} aoEscolher={filtrarTerritorio} doSimo={visao === "simo"} />}
      {aba === "municipios" && <ResumoMunicipios r={porMunicipio} aoEscolher={filtrarMunicipio} doSimo={visao === "simo"} />}
      {aba === "mapa" && <MapaTerritorios linhas={resumo.linhas} aoEscolher={filtrarTerritorio} />}
      {aba === "tracados" && <MapaTracados acoes={filtradas} filtros={descreverFiltros(estado, valores)} ehAdmin={ehAdmin} comPct={comPct} detalhes={modo === "hidricos"} />}
      {aba === "lista" && (
        <div className="space-y-3">
          <ResumoSimples acoes={filtradas} />
          <ListaAcoes acoes={filtradas} pagina={pagina} aoMudarPagina={setPagina} comPct={comPct} doSimo={visao === "simo"} />
        </div>
      )}
      {aba === "cruzam" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">Ações cujo traçado passa por mais de um território (qualquer parte conta, mesmo pequena). Servem para conferir o enquadramento e dividir a análise.</p>
          <ResumoSimples acoes={cruzam} />
          <ListaAcoes acoes={cruzam} pagina={pagina} aoMudarPagina={setPagina} comPct={comPct} />
        </div>
      )}
    </div>
  );
}

type PropsCorpo = Parameters<typeof CorpoAnalise>[0];

// Duas visões da MESMA tela (mesmos filtros, abas e Excel): por KML (a de sempre, intocada) e pelos dados do SIMO
// (só as ações sem localização, com município e território vindos das colunas do SIMO).
export function AnaliseTerritorio(props: Omit<PropsCorpo, "visao">) {
  const [visao, setVisao] = useState<"kml" | "simo">("kml");
  const { acoes, territorios, modo = "analise" } = props;
  const acoesSimo = useMemo(() => {
    const porNome = new Map<string, string>();
    for (const t of territorios) {
      porNome.set(normalizarNome(t), t);
      porNome.set(normalizarNome(rotuloTerritorio(t)), t);
    }
    return acoes
      .filter((a) => a.origem !== "tracado")
      .map((a): AcaoT => {
        // Territórios: os que o SIMO informou (se são dos 12); sem eles, os dos municípios informados. Dividem a ação em partes iguais.
        const doSimo = a.simoTerritoriosLista.map((t) => porNome.get(normalizarNome(t))).filter((t): t is string => !!t);
        const dosMunicipios = a.simoMunicipiosLista.map((m) => m.territorio).filter((t): t is string => !!t);
        const terrs = Array.from(new Set(doSimo.length ? doSimo : dosMunicipios));
        const munis = a.simoMunicipiosLista.map((m) => m.nome);
        return {
          ...a,
          partes: terrs.map((nome) => ({ nome, pct: 1 / terrs.length, metros: 0, pontos: 0 })),
          municipios: munis.map((nome) => ({ nome, pct: 1 / munis.length })),
          origem: terrs.length || munis.length ? "municipio" : "nenhuma",
        };
      });
  }, [acoes, territorios]);

  return (
    <div className="space-y-4">
      {modo === "analise" && (
        <nav className="flex flex-wrap gap-2">
          {(
            [
              ["kml", "Análise por KML"],
              ["simo", "Análise pelo SIMO (sem KML)"],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setVisao(chave)}
              className={"rounded-full px-4 py-2 text-xs font-semibold " + (visao === chave ? "bg-series-1 text-white" : "border border-black/10 bg-surface text-ink-secondary hover:bg-plane")}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      )}
      {/* key: trocar de visão recomeça a tela com os filtros dessa visão (o filtro gravado é separado por visão). */}
      {visao === "simo" && modo === "analise" ? (
        <CorpoAnalise key="simo" {...props} visao="simo" acoes={acoesSimo} tela="analise_territorio_simo" filtroGravado={null} somenteLeitura />
      ) : (
        <CorpoAnalise key="kml" {...props} visao="kml" />
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
            <th className="px-3 py-2.5 text-right">Valor pago</th>
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
                <button onClick={() => aoEscolher(rotuloTerritorio(l.territorio))} className="flex items-center gap-2 font-medium text-ink-primary hover:underline" title="Ver as ações que passam por este território (inclui as que só passam em parte)">
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

// Visão pelo SIMO: só quantidade de ações e percentuais, contando a ação em TODO território em que ela aparece.
function ResumoPassagem({ r, aoEscolher, doSimo }: { r: ReturnType<typeof resumoPassagem>; aoEscolher: (rotulo: string) => void; doSimo: boolean }) {
  const maior = Math.max(1, ...r.linhas.map((l) => l.acoes));
  const pct = (v: number, t: number) => (t > 0 ? ((v / t) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "-");
  const dicas = {
    acoes: "Ações que passam por este território.\n\nA ação conta em TODO território em que aparece, não só no principal. Ex.: uma ação com municípios em Cocais e em Carnaubais conta 1 em Cocais e 1 em Carnaubais.\nPor isso a soma da coluna pode passar do total de ações.",
    pctAcoes: "% das ações = ações do território ÷ total de ações (distintas) da análise.\n\nEx.: 12 ações no território de um total de 109 = 11%.\nComo uma ação pode estar em mais de um território, a soma dos percentuais pode passar de 100%.",
    exclusivas: "Ações que aparecem SÓ neste território (todos os municípios dela estão nele).",
    tambem: "Ações que passam por este território e também por pelo menos outro.",
    km: "Quilômetros de traçado (KML) que ficam dentro do território, somando todas as ações que passam por ele.\n\nO traçado de uma ação que cruza territórios é dividido: cada território recebe só os km que caem nele. Ação sem KML não soma km.",
    comTracado: "Ações que passam por este território e têm KML (traçado) anexado.",
    invest: "% do investimento = valor contratado rateado do território ÷ valor contratado total.\n\nO valor contratado de cada ação é dividido em partes iguais entre os territórios em que ela aparece. Ex.: ação de R$ 300 mil em 3 territórios = R$ 100 mil em cada.\nAssim a soma dos territórios dá 100%.\nAção sem valor contratado informado no SIMO não entra no cálculo.",
  };
  return (
    <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2.5">{doSimo ? "Território (dado do SIMO)" : "Território"}</th>
            <th className="px-3 py-2.5 text-right" title={dicas.acoes}>
              Ações que passam ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.pctAcoes}>
              % das ações ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.exclusivas}>
              Só neste território ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.tambem}>
              Também em outro ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.invest}>
              % do investimento ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.km}>
              Traçado (km) ⓘ
            </th>
            <th className="px-3 py-2.5 text-right" title={dicas.comTracado}>
              Com traçado ⓘ
            </th>
          </tr>
        </thead>
        <tbody>
          {r.linhas.map((l) => (
            <tr key={l.territorio} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
              <td className="px-4 py-2">
                <button onClick={() => aoEscolher(rotuloTerritorio(l.territorio))} className="flex items-center gap-2 font-medium text-ink-primary hover:underline" title="Ver as ações que passam por este território">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_TERRITORIO[l.territorio] ?? "#6b7280" }} />
                  {rotuloTerritorio(l.territorio)}
                </button>
                <div className="mt-1 h-1 rounded bg-black/5">
                  <div className="h-1 rounded" style={{ width: `${(l.acoes / maior) * 100}%`, background: COR_TERRITORIO[l.territorio] ?? "#6b7280" }} />
                </div>
              </td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.acoes)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{pct(l.acoes, r.totalAcoes)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.exclusivas)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.tambem)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{pct(l.investimento, r.totalInvestimento)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{l.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.comTracado)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 bg-plane font-semibold text-ink-primary">
            <td className="px-4 py-2.5">Total (ações distintas)</td>
            <td className="tabular px-3 py-2.5 text-right">{inteiro(r.totalAcoes)}</td>
            <td className="tabular px-3 py-2.5 text-right">100%</td>
            <td className="px-3 py-2.5 text-right">-</td>
            <td className="px-3 py-2.5 text-right">-</td>
            <td className="tabular px-3 py-2.5 text-right">100%</td>
            <td className="tabular px-3 py-2.5 text-right">{r.linhas.reduce((t, l) => t + l.km, 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
            <td className="tabular px-3 py-2.5 text-right">{inteiro(r.linhas.reduce((t, l) => t + l.comTracado, 0) ? r.totalComTracado : 0)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-black/5 px-4 py-2 text-[11px] text-ink-muted">
        A ação conta em todo território em que aparece (passe o mouse nos títulos para ver as fórmulas). Por isso a soma da coluna de ações e dos % de ações pode passar do total; o % do investimento divide o valor da ação entre os territórios e fecha em 100%.
      </p>
    </section>
  );
}

// Mesma lógica do resumo por território, por município.
function ResumoMunicipios({ r, aoEscolher, doSimo }: { r: ReturnType<typeof resumoPorMunicipio>; aoEscolher: (chave: string) => void; doSimo: boolean }) {
  const [busca, setBusca] = useState("");
  const maior = Math.max(1, ...r.linhas.map((l) => l.acoes));
  const pct = (v: number, t: number) => (t > 0 ? ((v / t) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "-");
  const linhas = busca.trim() ? r.linhas.filter((l) => normalizarNome(l.nome).includes(normalizarNome(busca))) : r.linhas;
  const dicas = {
    acoes: "Ações que passam por este município.\n\nA ação conta em TODO município em que aparece. Ex.: uma ação em Jurema e em São Lourenço do Piauí conta 1 em cada.\nPor isso a soma da coluna pode passar do total de ações.",
    pctAcoes: "% das ações = ações do município ÷ total de ações (distintas) da análise.\n\nEx.: 12 ações no município de um total de 1.314 = 0,9%.\nA soma pode passar de 100%, porque uma ação pode estar em mais de um município.",
    exclusivas: "Ações que aparecem SÓ neste município.",
    tambem: "Ações que passam por este município e também por pelo menos outro.",
    invest: "% do investimento = valor contratado rateado do município ÷ valor contratado total.\n\nO valor contratado de cada ação é dividido em partes iguais entre os municípios em que ela aparece. Ex.: ação de R$ 300 mil em 3 municípios = R$ 100 mil em cada.\nAssim a soma dos municípios dá 100%.\nAção sem valor contratado informado no SIMO não entra no cálculo.",
    km: "Quilômetros de traçado (KML) dentro do município: extensão do traçado da ação × a parte dele que cai no município.\nAção sem KML não soma km.",
    comTracado: "Ações do município que têm KML (traçado) anexado.",
  };
  return (
    <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-2.5">
        <p className="text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(r.linhas.length)}</strong> município(s){doSimo ? " (dado do SIMO)" : ""} com ação.
        </p>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar município..." className={campo + " w-56"} />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2.5">Município</th>
            <th className="px-3 py-2.5">Território</th>
            <th className="px-3 py-2.5 text-right" title={dicas.acoes}>Ações que passam ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.pctAcoes}>% das ações ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.exclusivas}>Só neste município ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.tambem}>Também em outro ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.invest}>% do investimento ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.km}>Traçado (km) ⓘ</th>
            <th className="px-3 py-2.5 text-right" title={dicas.comTracado}>Com traçado ⓘ</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-black/5 last:border-0 hover:bg-plane/60">
              <td className="px-4 py-2">
                <button onClick={() => aoEscolher(l.chave)} className="font-medium text-ink-primary hover:underline" title="Ver as ações que passam por este município">
                  {l.nome}
                </button>
                <div className="mt-1 h-1 rounded bg-black/5">
                  <div className="h-1 rounded bg-series-1" style={{ width: `${(l.acoes / maior) * 100}%` }} />
                </div>
              </td>
              <td className="px-3 py-2 text-ink-secondary">{l.territorio ? rotuloTerritorio(l.territorio) : "-"}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.acoes)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{pct(l.acoes, r.totalAcoes)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.exclusivas)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.tambem)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{pct(l.investimento, r.totalInvestimento)}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{l.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
              <td className="tabular px-3 py-2 text-right text-ink-secondary">{inteiro(l.comTracado)}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-ink-muted">Nenhum município encontrado.</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 bg-plane font-semibold text-ink-primary">
            <td className="px-4 py-2.5">Total (ações distintas)</td>
            <td className="px-3 py-2.5" />
            <td className="tabular px-3 py-2.5 text-right">{inteiro(r.totalAcoes)}</td>
            <td className="tabular px-3 py-2.5 text-right">100%</td>
            <td className="px-3 py-2.5 text-right">-</td>
            <td className="px-3 py-2.5 text-right">-</td>
            <td className="tabular px-3 py-2.5 text-right">100%</td>
            <td className="tabular px-3 py-2.5 text-right">{r.linhas.reduce((t, l) => t + l.km, 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
            <td className="px-3 py-2.5 text-right">-</td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-black/5 px-4 py-2 text-[11px] text-ink-muted">
        A ação conta em todo município em que aparece (passe o mouse nos títulos para ver as fórmulas). A soma das ações e dos % de ações pode passar do total; o % do investimento divide o valor da ação entre os municípios e fecha em 100%.
      </p>
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
      <td className={c}>{dinheiro(l.pago)}</td>
      <td className={c}>{l.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
      <td className={c}>{inteiro(l.comTracado)}</td>
    </>
  );
}

// ---------- resumo simples (acompanha os filtros) ----------

// Cards de totais das abas "Resumo por território" e "Resumo por município": as ações filtradas, sem repetir nenhuma.
function CartoesResumo({ acoes, doSimo, divisao }: { acoes: AcaoT[]; doSimo: boolean; divisao: { rotulo: string; qtd: number } }) {
  const r = useMemo(() => {
    const contratado = acoes.reduce((t, a) => t + (a.original ?? 0), 0);
    const comAditivos = acoes.reduce((t, a) => t + valorFinal(a), 0);
    const pago = acoes.reduce((t, a) => t + (a.pago ?? 0), 0);
    // Quantidade que vem do SIMO, somada POR UNIDADE (km, m², unidade...: somar unidades diferentes não faz sentido).
    const porUnidade = new Map<string, number>();
    for (const a of acoes) {
      if (a.quantidade == null) continue;
      const u = (a.unidade ?? "").trim().toUpperCase() || "SEM UNIDADE";
      porUnidade.set(u, (porUnidade.get(u) ?? 0) + a.quantidade);
    }
    // Quantidade automática = extensão do traçado (KML) calculada pelo painel, em km.
    const kmAuto = acoes.reduce((t, a) => t + a.extensaoM, 0) / 1000;
    // Comparação justa em km: só as ações cuja unidade no SIMO é KM, e o traçado delas.
    const emKm = acoes.filter((a) => (a.unidade ?? "").trim().toUpperCase() === "KM" && a.quantidade != null);
    const kmSimoEmKm = emKm.reduce((t, a) => t + (a.quantidade ?? 0), 0);
    const kmAutoEmKm = emKm.reduce((t, a) => t + a.extensaoM, 0) / 1000;
    return {
      qtd: acoes.length,
      vinculadas: acoes.filter(vinculada).length,
      comTracado: acoes.filter((a) => a.origem === "tracado").length,
      cruzam: acoes.filter(cruza).length,
      contratado,
      comAditivos,
      pago,
      kmAuto,
      kmSimoEmKm,
      kmAutoEmKm,
      qtdEmKm: emKm.length,
      porUnidade: Array.from(porUnidade).sort((x, y) => y[1] - x[1]),
    };
  }, [acoes]);
  const km = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const cartoes: { rotulo: string; valor: string; dica?: string; azul?: string[]; ajuda?: string }[] = [
    { rotulo: "Total de ações", valor: inteiro(r.qtd), dica: `${inteiro(r.vinculadas)} vinculada(s)`, ajuda: "Ações distintas dos filtros atuais. Cada ação conta uma vez aqui, mesmo que apareça em mais de um território/município nas linhas abaixo." },
    { rotulo: "Valor investido (contratado)", valor: dinheiro(r.contratado), dica: Math.abs(r.comAditivos - r.contratado) > 0.5 ? `com aditivos: ${dinheiro(r.comAditivos)}` : undefined, ajuda: "Soma do valor contratado (Valor original) das ações. Embaixo, o valor final com aditivos e supressões." },
    { rotulo: "Valor pago", valor: dinheiro(r.pago), dica: r.contratado > 0 ? `${((r.pago / r.contratado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do contratado` : undefined, ajuda: "Soma do Valor pago total do SIMO." },
    ...(doSimo
      ? []
      : [
          {
            rotulo: "Quantidade automática",
            valor: `${km(r.kmAuto)} km`,
            dica: `traçado (KML) de ${inteiro(r.comTracado)} ação(ões) · ${inteiro(r.qtd - r.comTracado)} sem traçado`,
            ajuda: "Extensão do traçado (KML) calculada pelo painel, a mesma soma da aba Mapa de KML (traçados).",
          },
        ]),
    { rotulo: "Quantidade SIMO", valor: "", azul: r.porUnidade.map(([u, v]) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${u}`), dica: r.porUnidade.length === 0 ? "sem quantidade" : "somada por unidade, como cadastrada no SIMO", ajuda: "Soma da Quantidade cadastrada no SIMO, separada por unidade de medida (km, m², unidade...)." },
    ...(doSimo || r.qtdEmKm === 0
      ? []
      : [
          {
            rotulo: "Automática × SIMO (km)",
            valor: r.kmSimoEmKm > 0 ? `${((r.kmAutoEmKm / r.kmSimoEmKm) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%` : "-",
            dica: `SIMO ${km(r.kmSimoEmKm)} km · automática ${km(r.kmAutoEmKm)} km`,
            ajuda: "Só as ações cuja unidade no SIMO é KM: traçado calculado pelo painel ÷ quantidade cadastrada no SIMO. Perto de 100% = o traçado confere com o cadastro.",
          },
        ]),
    { rotulo: divisao.rotulo, valor: inteiro(divisao.qtd) },
    ...(doSimo ? [] : [{ rotulo: "Cruzam territórios", valor: inteiro(r.cruzam), dica: "ações em mais de um território" }]),
  ];
  return (
    <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {cartoes.map((c) => (
          <li key={c.rotulo} className="rounded-lg bg-plane px-3 py-2.5" title={c.ajuda}>
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{c.rotulo}</p>
            {c.azul ? (
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-y-auto pr-1">
                {c.azul.map((l) => (
                  <li key={l} className="tabular text-sm font-semibold text-series-1">
                    {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tabular mt-0.5 text-sm font-semibold text-ink-primary">{c.valor}</p>
            )}
            {c.dica && <p className="text-[11px] leading-snug text-ink-muted">{c.dica}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResumoSimples({ acoes }: { acoes: AcaoT[] }) {
  const r = useMemo(() => {
    const contratado = acoes.reduce((s, a) => s + (a.original ?? 0), 0);
    const pago = acoes.reduce((s, a) => s + (a.pago ?? 0), 0);
    // Quantidade somada POR UNIDADE (km, m², unidade...: somar unidades diferentes não faz sentido).
    const porUnidade = new Map<string, number>();
    for (const a of acoes) {
      if (a.quantidade == null) continue;
      const u = (a.unidade ?? "").trim().toUpperCase() || "SEM UNIDADE";
      porUnidade.set(u, (porUnidade.get(u) ?? 0) + a.quantidade);
    }
    return {
      porUnidade: Array.from(porUnidade).sort((x, y) => y[1] - x[1]),
      qtd: acoes.length,
      vinculadas: acoes.filter(vinculada).length,
      comTracado: acoes.filter((a) => a.origem === "tracado").length,
      cruzam: acoes.filter(cruza).length,
      aditivadas: acoes.filter(aditivada).length,
      contratado,
      pago,
      comPago: acoes.filter((a) => a.pago != null).length,
      km: acoes.reduce((s, a) => s + a.extensaoM, 0) / 1000,
    };
  }, [acoes]);
  const cartoes: { rotulo: string; valor: string; dica?: string; azul?: string[] }[] = [
    { rotulo: "Ações", valor: inteiro(r.qtd), dica: `${inteiro(r.vinculadas)} vinculada(s)` },
    { rotulo: "Valor contratado", valor: dinheiro(r.contratado) },
    { rotulo: "Valor pago", valor: dinheiro(r.pago), dica: r.contratado > 0 ? `${((r.pago / r.contratado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do contratado` : undefined },
    { rotulo: "Com traçado", valor: inteiro(r.comTracado), dica: `${inteiro(r.qtd - r.comTracado)} sem traçado` },
    { rotulo: "Cruzam territórios", valor: inteiro(r.cruzam) },
    { rotulo: "Aditivadas", valor: inteiro(r.aditivadas) },
    { rotulo: "Extensão do traçado", valor: `${r.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` },
    { rotulo: "Quantidade (soma)", valor: "", azul: r.porUnidade.map(([u, v]) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${u}`), dica: r.porUnidade.length === 0 ? "sem quantidade" : "somada por unidade" },
  ];
  return (
    <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {cartoes.map((c) => (
          <li key={c.rotulo} className="rounded-lg bg-plane px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{c.rotulo}</p>
            {c.azul ? (
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-y-auto pr-1">
                {c.azul.map((l) => (
                  <li key={l} className="tabular text-sm font-semibold text-series-1">
                    {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tabular mt-0.5 text-sm font-semibold text-ink-primary">{c.valor}</p>
            )}
            {c.dica && <p className="text-[11px] text-ink-muted">{c.dica}</p>}
          </li>
        ))}
      </ul>
      {r.qtd > 0 && r.comPago === 0 && (
        <p className="mt-2 text-xs text-status-warning">O SIMO ainda não trouxe o valor pago. Inclua a coluna &quot;VALOR PAGO TOTAL&quot; no relatório do SIMO e rode a sincronização.</p>
      )}
    </section>
  );
}

// ---------- lista ----------

function ListaAcoes({ acoes, pagina, aoMudarPagina, comPct, doSimo = false }: { acoes: AcaoT[]; pagina: number; aoMudarPagina: (p: number) => void; comPct: boolean; doSimo?: boolean }) {
  const [verMapa, setVerMapa] = useState<{ id: string; nome: string } | null>(null);
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
            <th className="px-3 py-2.5">Tipologia</th>
            <th className="px-3 py-2.5 text-series-1">Unidade</th>
            <th className="px-3 py-2.5 text-right text-series-1">Quantidade</th>
            {!doSimo && (
              <th className="px-3 py-2.5 text-right" style={{ color: "#8b5a2b" }} title="Extensão do traçado (KML) calculada pelo painel, em km.">
                Extensão do traçado (km)
              </th>
            )}
            <th className="px-3 py-2.5">{doSimo ? "Município(s) (dado do SIMO)" : "Município(s)"}</th>
            <th className="px-3 py-2.5">{doSimo ? "Território(s) (dado do SIMO)" : "Território(s)"}</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Vinculação</th>
            <th className="px-3 py-2.5 text-right">Exec.</th>
            <th className="px-3 py-2.5">Criada</th>
            <th className="px-3 py-2.5">Recebida</th>
            <th className="px-3 py-2.5 text-right">Valor pago</th>
            <th className="px-3 py-2.5">KML</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={doSimo ? 15 : 16} className="px-4 py-8 text-center text-ink-muted">
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
              <td className="px-3 py-2 text-ink-secondary">{a.tipologia ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-series-1">{a.unidade ?? "-"}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium text-series-1">{(a.quantidade != null ? a.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-")}</td>
              {!doSimo && (
                <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium" style={{ color: "#8b5a2b" }}>
                  {a.extensaoM > 0 ? (a.extensaoM / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-"}
                </td>
              )}
              <td className="px-3 py-2 text-ink-secondary">{descricaoDosMunicipios(a, comPct)}</td>
              <td className="px-3 py-2 text-ink-secondary">
                {a.partes.length === 0 ? (
                  <span className="text-ink-muted">{rotuloTerritorio(SEM_TERRITORIO)}</span>
                ) : (
                  <ul className="space-y-0.5">
                    {a.partes.map((p) => (
                      <li key={p.nome} className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_TERRITORIO[p.nome] ?? "#6b7280" }} />
                        {rotuloTerritorio(p.nome)}{comPct && <span className="ml-1 text-ink-muted">{Math.round(p.pct * 100)}%</span>}
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
              <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{a.pago != null ? dinheiro(a.pago) : "-"}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => setVerMapa({ id: a.id, nome: a.nome })}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-plane"
                  title={a.origem === "tracado" ? "Ver o traçado no mapa, com bairros, zona e território" : "Esta ação ainda não tem traçado verificado"}
                >
                  <MapPinned size={13} /> Verificar KML
                </button>
              </td>
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
      {verMapa && <JanelaMapa id={verMapa.id} nome={verMapa.nome} aoFechar={() => setVerMapa(null)} />}
    </section>
  );
}

// ---------- mapa de traçados (KML) das ações do filtro ----------

const LIMITE_TRACADOS = 1500;
// Quantos símbolos o mapa desenha de uma vez (cada um é um elemento da página; acima disso vira bolinha).
const LIMITE_SIMBOLOS = 2500;
// Caixa do Piauí (com folga): coordenada fora dela é erro de digitação provável e não entra no enquadramento do mapa.
const naRegiao = (p: [number, number]) => p[0] > -13 && p[0] < -0.5 && p[1] > -48.5 && p[1] < -38;
const LIMITE_FONTES = 3000;
const LIMITE_LISTA_PDF = 5000;

type DadosTracados = { acoes: { id: string; linhas: [number, number][][]; pontos: [number, number][]; poligonos: [number, number][][] }[]; semTracado: number };

function MapaTracados({ acoes, filtros, ehAdmin, comPct, detalhes = false }: { acoes: AcaoT[]; filtros: string[]; ehAdmin: boolean; comPct: boolean; detalhes?: boolean }) {
  const [dados, setDados] = useState<DadosTracados | null>(null);
  const [contornos, setContornos] = useState<{ nome: string; linhas: [number, number][][] }[]>([]);
  const [gerado, setGerado] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState<{ id: string; nome: string } | null>(null);
  const [corPor, setCorPor] = useState<"status" | "territorio">("status");
  const [subpastas, setSubpastas] = useState<"tipologia" | "status">("tipologia");
  const [baixando, setBaixando] = useState(false);
  const [excelKml, setExcelKml] = useState<{ feitos: number; total: number } | null>(null);
  const [avisoKml, setAvisoKml] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const ids = useMemo(() => acoes.map((a) => a.id), [acoes]);
  const assinatura = useMemo(() => ids.join(","), [ids]);
  const desatualizado = dados !== null && gerado !== assinatura;

  // De onde vem o traçado de cada ação do filtro (georreferenciada?) e quais já foram conferidas no SIMO.
  const [fontes, setFontes] = useState<Record<string, string> | null>(null);
  const [conferidas, setConferidas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Record<string, string>>({});
  const muitas = ids.length > LIMITE_FONTES;
  const [erroFontes, setErroFontes] = useState<string | null>(null);
  useEffect(() => {
    setFontes(null);
    setErroFontes(null);
    if (ids.length === 0 || muitas) return;
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const resp = await fetch("/api/territorios/fontes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal: controle.signal });
        const json = (await resp.json().catch(() => null)) as { fontes?: Record<string, string>; conferidas?: Record<string, string> } | null;
        if (resp.ok && json?.fontes) {
          setFontes(json.fontes);
          setConferidas(json.conferidas ?? {});
        } else setErroFontes((json as { error?: string } | null)?.error ?? `O servidor respondeu ${resp.status}.`);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setErroFontes("Sem conexão com o servidor.");
      }
    }, 400);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  // Aplica o resultado de uma conferência no SIMO: se achou o KML, ele já fica guardado (Arquivos KML, Sobreposições e Verificação de bairros usam o mesmo).
  function aplicarResultado(r: ResultadoLote) {
    if (r.situacao === "baixado" || r.situacao === "ja_tinha") {
      setFontes((f) => ({ ...(f ?? {}), [r.id]: f?.[r.id] === "mapa" ? "ambos" : (f?.[r.id] ?? "kml") }));
      setConferidas((c) => {
        const n = { ...c };
        delete n[r.id];
        return n;
      });
      setResultado((x) => ({ ...x, [r.id]: r.situacao === "baixado" ? `KML baixado${r.extensaoKm != null ? ` (${Number(r.extensaoKm).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km)` : ""}` : "KML já guardado" }));
    } else if (r.situacao === "sem_kml") {
      setConferidas((c) => ({ ...c, [r.id]: "sem_kml" }));
      setResultado((x) => ({ ...x, [r.id]: "Sem KML no SIMO" }));
    } else if (r.situacao === "erro") {
      setConferidas((c) => ({ ...c, [r.id]: "erro" }));
      setResultado((x) => ({ ...x, [r.id]: r.mensagem ?? "Erro ao baixar" }));
    } else {
      setResultado((x) => ({ ...x, [r.id]: "Adiado: tente de novo" }));
    }
  }

  async function conferirUma(id: string): Promise<ResultadoLote | null> {
    try {
      const resp = await fetch("/api/kml/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      const json = (await resp.json().catch(() => null)) as { error?: string; resultados?: ResultadoLote[] } | null;
      const r = json?.resultados?.[0];
      if (!resp.ok || !r) return null;
      aplicarResultado(r);
      return r;
    } catch {
      return null;
    }
  }

  // Conferência em lote: vai ao SIMO, ação por ação (10 por envio), e guarda o KML de quem tiver.
  const [lote, setLote] = useState<{ rodando: boolean; feitos: number; total: number; baixados: number; semKml: number; erros: number; fim?: string } | null>(null);
  const [refazerSemKml, setRefazerSemKml] = useState(false);
  const parar = useRef(false);
  const alvos = useMemo(
    () => (fontes === null ? [] : acoes.filter((a) => !fontes[a.id] && (refazerSemKml || conferidas[a.id] !== "sem_kml")).map((a) => a.id)),
    [acoes, fontes, conferidas, refazerSemKml]
  );

  async function conferirTodas() {
    if (alvos.length === 0) return;
    parar.current = false;
    let fila = [...alvos];
    const total = fila.length;
    let feitos = 0;
    let baixados = 0;
    let semKml = 0;
    let erros = 0;
    setLote({ rodando: true, feitos, total, baixados, semKml, erros });
    let fim = "";
    try {
      while (fila.length > 0 && !parar.current) {
        const parte = fila.slice(0, 10);
        fila = fila.slice(10);
        const resp = await fetch("/api/kml/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: parte, forcar: false }) });
        const json = (await resp.json().catch(() => null)) as { error?: string; resultados?: ResultadoLote[] } | null;
        if (!resp.ok || !json?.resultados) {
          fim = json?.error ?? `O servidor respondeu ${resp.status}. Os que já foram conferidos ficaram guardados.`;
          break;
        }
        // "adiado": o servidor chegou perto do limite de tempo, a ação volta para a fila.
        const adiados = json.resultados.filter((r) => r.situacao === "adiado").map((r) => r.id);
        for (const r of json.resultados) {
          if (r.situacao === "adiado") continue;
          aplicarResultado(r);
          feitos++;
          if (r.situacao === "baixado") baixados++;
          else if (r.situacao === "sem_kml") semKml++;
          else if (r.situacao === "erro") erros++;
        }
        if (adiados.length > 0) fila = [...adiados, ...fila];
        setLote({ rodando: true, feitos, total, baixados, semKml, erros });
      }
    } catch {
      fim = "Sem conexão com o servidor. Os que já foram conferidos ficaram guardados.";
    }
    if (!fim) fim = parar.current ? "Parado. Os que já foram conferidos ficaram guardados." : "Conferência terminada.";
    setLote({ rodando: false, feitos, total, baixados, semKml, erros, fim });
  }
  const grande = acoes.length > LIMITE_TRACADOS;

  async function gerar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/territorios/tracados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const json = (await resp.json().catch(() => null)) as (DadosTracados & { error?: string }) | null;
      if (!resp.ok) setErro(json?.error ?? `Não foi possível gerar o mapa (o servidor respondeu ${resp.status}).`);
      else if (!json || !Array.isArray(json.acoes)) setErro("Resposta inesperada do servidor. Recarregue a página (Ctrl+F5).");
      else {
        setDados(json);
        setGerado(assinatura);
        if (contornos.length === 0) {
          const c = await fetch("/api/territorios/mapa?contornos=1")
            .then((r) => r.json())
            .catch(() => null);
          if (c && Array.isArray(c.territorios)) setContornos(c.territorios);
        }
      }
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  // Baixa um KML com as ações do filtro (uma pasta por território; dentro, uma por tipologia ou status) para abrir no Google Earth.
  async function baixarKml() {
    setBaixando(true);
    setAvisoKml(null);
    try {
      const itens = acoes.map((a) => ({
        id: a.id,
        nome: a.nome,
        orgao: a.orgao ?? "",
        status: a.status ?? "",
        tipologia: a.tipologia ?? "",
        territorio: a.partes.length ? rotuloTerritorio(principal(a)) : "",
        territorios: descricaoDosTerritorios(a, comPct),
        vinculacao: vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número",
        execucao: a.pct != null ? `${Math.round(a.pct * 100)}%` : "",
      }));
      const resp = await fetch("/api/territorios/kml", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens, subpastas }) });
      if (!resp.ok) {
        const json = (await resp.json().catch(() => null)) as { error?: string } | null;
        setAvisoKml({ tipo: "erro", texto: json?.error ?? `Não foi possível gerar o KML (o servidor respondeu ${resp.status}).` });
        return;
      }
      const semTracado = Number(resp.headers.get("X-Sem-Tracado") ?? 0);
      const comTracado = Number(resp.headers.get("X-Com-Tracado") ?? 0);
      const url = URL.createObjectURL(await resp.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `mapa-geral-${new Date().toISOString().slice(0, 10)}.kml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setAvisoKml({ tipo: "ok", texto: `KML baixado com ${inteiro(comTracado)} ação(ões)${semTracado > 0 ? `; ${inteiro(semTracado)} sem traçado guardado ficaram de fora` : ""}. Abra no Google Earth.` });
    } catch {
      setAvisoKml({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setBaixando(false);
    }
  }

  // Excel com os dados dos KML de TUDO que está guardado (sem filtro): uma linha por geometria e bairro (ID duplicado quando preciso).
  async function baixarExcelKml() {
    setAvisoKml(null);
    setExcelKml({ feitos: 0, total: 0 });
    try {
      const linhas: { id: string; pasta: string; geometria: string; tipo: string; municipio: string; bairro: string; zona: string; km: number | null; kmTotal: number | null }[] = [];
      const sem: { id: string; motivo: string }[] = [];
      const dados = new Map<string, { nome: string; orgao: string; tipologia: string }>();
      type Resp = { linhas?: typeof linhas; sem?: typeof sem; info?: Record<string, { nome: string; orgao: string; tipologia: string }>; proximo?: string | null; total?: number | null; error?: string };
      let apos = "";
      let total = 0;
      let feitos = 0;
      for (;;) {
        let json: Resp | null = null;
        let ok = false;
        for (let tentativa = 0; tentativa < 3 && !ok; tentativa++) {
          const resp = await fetch("/api/territorios/kml-excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todos: true, apos }) }).catch(() => null);
          json = resp ? await resp.json().catch(() => null) : null;
          ok = !!resp?.ok && Array.isArray(json?.linhas);
        }
        if (!ok || !json) {
          setAvisoKml({ tipo: "erro", texto: json?.error ?? "Não consegui ler os KML (sem resposta do servidor). Tente de novo." });
          return;
        }
        linhas.push(...(json.linhas ?? []));
        sem.push(...(json.sem ?? []));
        for (const [k, v] of Object.entries(json.info ?? {})) dados.set(k, v);
        if (typeof json.total === "number") total = json.total;
        feitos += new Set((json.linhas ?? []).map((l) => l.id)).size + (json.sem ?? []).length;
        setExcelKml({ feitos: Math.min(feitos, total), total });
        if (!json.proximo) break;
        apos = json.proximo;
      }

      const info = dados;
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Monitoramento de Obras";
      const cab = (ws: import("exceljs").Worksheet, titulos: string[]) => {
        const row = ws.getRow(1);
        titulos.forEach((t, k) => (row.getCell(k + 1).value = t));
        row.height = 28;
        row.eachCell((c) => {
          c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7F8FB0" } };
          c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        });
        ws.views = [{ state: "frozen", ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: titulos.length } };
      };
      const ws = wb.addWorksheet("Dados do KML");
      ws.columns = [{ width: 10 }, { width: 50 }, { width: 22 }, { width: 24 }, { width: 22 }, { width: 28 }, { width: 22 }, { width: 38 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 24 }];
      cab(ws, ["ID SIMO", "Nome da ação", "Órgão", "Tipologia", "Município", "Bairro", "Zona", "Nome da geometria", "Tipo da geometria", "Trecho no bairro (km)", "Extensão da geometria (km)", "Pasta do KML"]);
      linhas.sort((a, b) => Number(a.id) - Number(b.id));
      linhas.forEach((l, k) => {
        const a = info.get(l.id);
        const row = ws.getRow(k + 2);
        row.values = [Number(l.id), a?.nome ?? "", a?.orgao ?? "", a?.tipologia ?? "", l.municipio, l.bairro, l.zona, l.geometria, l.tipo, l.km, l.kmTotal, l.pasta];
        row.getCell(10).numFmt = "#,##0.000";
        row.getCell(11).numFmt = "#,##0.000";
      });
      const ws2 = wb.addWorksheet("Sem KML");
      ws2.columns = [{ width: 10 }, { width: 50 }, { width: 22 }, { width: 24 }, { width: 50 }];
      cab(ws2, ["ID SIMO", "Nome da ação", "Órgão", "Tipologia", "Motivo"]);
      sem.sort((a, b) => Number(a.id) - Number(b.id));
      sem.forEach((l, k) => {
        const a = info.get(l.id);
        ws2.getRow(k + 2).values = [Number(l.id), a?.nome ?? "", a?.orgao ?? "", a?.tipologia ?? "", l.motivo];
      });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `dados-kml-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const comKml = new Set(linhas.map((l) => l.id)).size;
      setAvisoKml({ tipo: "ok", texto: `Excel baixado: ${inteiro(linhas.length)} linha(s) de ${inteiro(comKml)} ação(ões) com KML; ${inteiro(sem.length)} ação(ões) com problema na leitura ficaram na aba "Sem KML".` });
    } catch {
      setAvisoKml({ tipo: "erro", texto: "Não foi possível gerar o Excel dos KML." });
    } finally {
      setExcelKml(null);
    }
  }

  // Ações com alguma coordenada longe do Piauí (erro de digitação no KML, ex.: latitude e longitude trocadas).
  const foraDaRegiao = useMemo(() => {
    const lista: string[] = [];
    for (const t of dados?.acoes ?? []) {
      const fora = t.linhas.some((l) => l.some((p) => !naRegiao(p))) || t.pontos.some((p) => !naRegiao(p)) || t.poligonos.some((l) => l.some((p) => !naRegiao(p)));
      if (fora) lista.push(t.id);
    }
    return lista;
  }, [dados]);

  const infoPorId = useMemo(() => new Map(acoes.map((a) => [a.id, a])), [acoes]);
  // Cor de cada ação: pelo status (padrão) ou pelo território principal.
  const rotuloDe = (a: AcaoT | undefined) => (corPor === "status" ? (a?.status ?? "(sem status)") : rotuloTerritorio(a ? principal(a) : SEM_TERRITORIO));
  const corDe = (a: AcaoT | undefined) => (corPor === "status" ? corDoStatus(a?.status) : (COR_TERRITORIO[a ? principal(a) : ""] ?? "#6b7280"));
  // Símbolos que aparecem no mapa: um por tipologia (só as ações que têm pontos).
  const simbolos = useMemo(() => {
    const m = new Map<string, { grupo: GrupoTipologia; n: number }>();
    for (const t of dados?.acoes ?? []) {
      if (t.pontos.length === 0) continue;
      const g = grupoDaTipologia(infoPorId.get(t.id)?.tipologia);
      const x = m.get(g.chave) ?? { grupo: g, n: 0 };
      x.n++;
      m.set(g.chave, x);
    }
    return Array.from(m.values()).sort((a, b) => b.n - a.n);
  }, [dados, infoPorId]);
  const contagem = useMemo(() => {
    const m = new Map<string, { n: number; cor: string }>();
    for (const t of dados?.acoes ?? []) {
      const a = infoPorId.get(t.id);
      const r = rotuloDe(a);
      const x = m.get(r) ?? { n: 0, cor: corDe(a) };
      x.n++;
      m.set(r, x);
    }
    return Array.from(m).sort((a, b) => b[1].n - a[1].n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, infoPorId, corPor]);

  return (
    <div className="space-y-4">
    <section className="space-y-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-ink-secondary">
          Desenha o traçado (KML do SIMO ou linhas, pontos e polígonos do mapa de obras) das <strong className="text-ink-primary">{inteiro(acoes.length)}</strong> ação(ões) do filtro, na cor do território. Mapa leve: as linhas são simplificadas.
        </p>
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-secondary">
          Cor por
          <select value={corPor} onChange={(e) => setCorPor(e.target.value as "status" | "territorio")} className={campo}>
            <option value="status">Status</option>
            <option value="territorio">Território</option>
          </select>
        </label>
        <button
          onClick={gerar}
          disabled={carregando || grande || acoes.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-series-1 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {carregando ? <Loader2 size={13} className="animate-spin" /> : <MapPinned size={13} />}
          {carregando ? "Gerando..." : dados ? "Gerar de novo" : "Gerar mapa"}
        </button>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Subpastas do KML
          <select value={subpastas} onChange={(e) => setSubpastas(e.target.value as "tipologia" | "status")} className={campo}>
            <option value="tipologia">Território › Tipologia</option>
            <option value="status">Território › Status</option>
          </select>
        </label>
        {ehAdmin && (
          <div className="flex items-center gap-2">
            {lote?.rodando ? (
              <button onClick={() => (parar.current = true)} className="flex items-center gap-1.5 rounded-full border border-status-critical/40 px-4 py-2 text-xs font-semibold text-status-critical hover:bg-status-critical/5">
                <Loader2 size={13} className="animate-spin" /> Conferindo {inteiro(lote.feitos)}/{inteiro(lote.total)} · Parar
              </button>
            ) : (
              <button
                onClick={conferirTodas}
                disabled={alvos.length === 0 || fontes === null}
                className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface px-4 py-2 text-xs font-semibold text-ink-secondary hover:bg-plane disabled:opacity-50"
                title="Vai ao SIMO ver, uma por uma, só as obras do filtro que ainda não têm traçado (as que já têm Ver no mapa não entram). Se achar, já baixa e guarda (vale para Arquivos KML, Sobreposições e Verificação de bairros)."
              >
                <RefreshCw size={13} /> Conferir {fontes === null ? "" : inteiro(alvos.length) + " "}no SIMO
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted" title="Inclui também as obras que já foram conferidas e deram 'sem KML'">
              <input type="checkbox" checked={refazerSemKml} onChange={(e) => setRefazerSemKml(e.target.checked)} disabled={lote?.rodando} className="h-3.5 w-3.5" />
              incluir as que deram &quot;sem KML&quot;
            </label>
          </div>
        )}
        <button
          onClick={baixarKml}
          disabled={baixando || grande || acoes.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-status-good px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          title="Baixa um arquivo KML com as ações do filtro, para abrir no Google Earth: uma pasta por território e subpastas por tipologia (ou status)"
        >
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {baixando ? "Gerando KML..." : "Baixar KML"}
        </button>
        <button
          onClick={baixarExcelKml}
          disabled={excelKml !== null}
          className="flex items-center gap-1.5 rounded-full bg-status-good px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          title="Baixa um Excel com os dados de TODOS os KML guardados (não usa os filtros da tela): ID, município, bairro, zona, nome e tipo da geometria e trecho em km (o ID se repete quando a ação tem várias geometrias ou passa por mais de um bairro)"
        >
          {excelKml ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {excelKml ? `Lendo KML ${inteiro(excelKml.feitos)}/${inteiro(excelKml.total)}...` : "Excel dos KML"}
        </button>
      </div>
      {lote && (
        <p className={"rounded-lg px-3 py-2 text-xs " + (lote.rodando ? "bg-plane text-ink-secondary" : lote.erros > 0 ? "bg-status-warning-bg text-status-warning" : "bg-status-good-bg text-status-good")}>
          {lote.rodando ? "Conferindo no SIMO... " : `${lote.fim} `}
          {inteiro(lote.feitos)} de {inteiro(lote.total)} conferida(s): <strong>{inteiro(lote.baixados)}</strong> com KML (baixado e guardado), <strong>{inteiro(lote.semKml)}</strong> sem KML no SIMO, {inteiro(lote.erros)} com erro.
          {!lote.rodando && lote.baixados > 0 && " Para as novas aparecerem nos territórios, rode Atualizar localização (na Análise por território)."}
        </p>
      )}
      {avisoKml && <p className={"rounded-lg px-3 py-2 text-xs " + (avisoKml.tipo === "ok" ? "bg-status-good-bg text-status-good" : "bg-status-critical/10 text-status-critical")}>{avisoKml.texto}</p>}
      {grande && (
        <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          São {inteiro(acoes.length)} ações. Para o mapa ficar leve, filtre até {inteiro(LIMITE_TRACADOS)} (por exemplo um território, um ano ou um órgão) e volte aqui.
        </p>
      )}
      {erro && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erro}</p>}
      {foraDaRegiao.length > 0 && (
        <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          {inteiro(foraDaRegiao.length)} ação(ões) têm coordenada fora do Piauí (provável erro no KML ou no mapa de obras): {foraDaRegiao.slice(0, 12).join(", ")}
          {foraDaRegiao.length > 12 ? "…" : ""}. O mapa se enquadra no Piauí e ignora essas coordenadas.
        </p>
      )}
      {desatualizado && <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">Os filtros mudaram depois que o mapa foi gerado. Clique em &quot;Gerar de novo&quot; para atualizar.</p>}
      {dados && (
        <>
          <ContemErro>
            <MapaDosTracados dados={dados} contornos={contornos} infoPorId={infoPorId} corPor={corPor} aoAbrir={(id, nome) => setVerMapa({ id, nome })} />
          </ContemErro>
          <ul className="flex flex-wrap gap-2">
            {contagem.map(([rotulo, x]) => (
              <li key={rotulo} className="flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 text-xs text-ink-secondary">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: x.cor }} />
                {rotulo}: <strong className="font-semibold">{inteiro(x.n)}</strong>
              </li>
            ))}
          </ul>
          {simbolos.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">Símbolos (tipologia das ações com ponto no mapa)</p>
              <ul className="flex flex-wrap gap-2">
                {simbolos.map(({ grupo, n }) => (
                  <li key={grupo.chave} className="flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 text-xs text-ink-secondary">
                    <span className="inline-flex" dangerouslySetInnerHTML={{ __html: svgSimbolo(grupo.icone, "#374151", 15) }} />
                    {grupo.rotulo}: <strong className="font-semibold">{inteiro(n)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            {inteiro(dados.acoes.length)} ação(ões) desenhada(s)
            {dados.semTracado > 0 ? `; ${inteiro(dados.semTracado)} sem traçado guardado (ficaram de fora)` : ""}. A cor segue o status (ou o território principal, se você trocar em "Cor por"); o contorno tracejado é o dos territórios. Passe o mouse para ver a ação e clique para abrir o Verificar KML.
          </p>
        </>
      )}
      {verMapa && (detalhes ? <DetalhesAcao acao={infoPorId.get(verMapa.id)} comPct={comPct} aoFechar={() => setVerMapa(null)} /> : <JanelaMapa id={verMapa.id} nome={verMapa.nome} aoFechar={() => setVerMapa(null)} />)}
    </section>
    <ListaDoMapa detalhes={detalhes} comPct={comPct} acoes={acoes} filtros={filtros} ehAdmin={ehAdmin} tr={{ fontes, conferidas, resultado, muitas, erroFontes, setFontes, setConferidas, setResultado, conferirUma }} aoAbrirKml={(id, nome) => setVerMapa({ id, nome })} />
    </div>
  );
}

// ---------- lista de obras abaixo do mapa (com PDF e conferência do KML no SIMO) ----------

type ResultadoLote = { id: string; situacao: "baixado" | "ja_tinha" | "sem_kml" | "erro" | "adiado"; mensagem?: string; extensaoKm?: number | null };

const reais = (v: number | null) => (v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

type EstadoTracados = {
  fontes: Record<string, string> | null;
  conferidas: Record<string, string>;
  resultado: Record<string, string>;
  muitas: boolean;
  /** Mensagem quando a consulta dos traçados falhou (a coluna Georreferenciada fica com "-"). */
  erroFontes: string | null;
  setFontes: React.Dispatch<React.SetStateAction<Record<string, string> | null>>;
  setConferidas: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setResultado: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Confere uma ação no SIMO (baixa o KML se tiver) e atualiza o estado; devolve a situação. */
  conferirUma: (id: string) => Promise<ResultadoLote | null>;
};

function ListaDoMapa({ acoes, filtros, aoAbrirKml, ehAdmin, tr, comPct, detalhes = false }: { detalhes?: boolean; comPct: boolean; acoes: AcaoT[]; filtros: string[]; aoAbrirKml: (id: string, nome: string) => void; ehAdmin: boolean; tr: EstadoTracados }) {
  const { fontes, conferidas, resultado, muitas, erroFontes } = tr;
  const [pagina, setPagina] = useState(1);
  const [conferindo, setConferindo] = useState<Record<string, boolean>>({});
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setPagina(1), [acoes]);

  // Georreferenciada? Sim (de onde vem o traçado) ou Não (e se já foi conferida no SIMO).
  const georref = (id: string): string => {
    if (fontes === null) return muitas || erroFontes ? "-" : "...";
    const f = fontes[id];
    if (f) return f === "kml" ? "Sim (KML do SIMO)" : f === "mapa" ? "Sim (mapa de obras)" : "Sim (KML e mapa)";
    const c = conferidas[id];
    return c === "sem_kml" ? "Não (sem KML no SIMO)" : c === "erro" ? "Não (erro ao baixar)" : "Não (não conferida)";
  };

  // Confere uma só ação no SIMO (botão da linha).
  async function conferirNoSimo(id: string) {
    setConferindo((c) => ({ ...c, [id]: true }));
    setErro(null);
    try {
      const r = await tr.conferirUma(id);
      if (!r) setErro("Não foi possível conferir no SIMO.");
    } finally {
      setConferindo((c) => ({ ...c, [id]: false }));
    }
  }

  const linhasPdf = () =>
    acoes.map((a) => ({
      id: a.id,
      nome: a.nome,
      orgao: a.orgao ?? "",
      municipios: descricaoDosMunicipios(a, comPct) === "-" ? "" : descricaoDosMunicipios(a, comPct),
      territorios: descricaoDosTerritorios(a, comPct),
      status: a.status ?? "",
      tipologia: a.tipologia ?? "",
      unidade: a.unidade ?? "",
      quantidade: a.quantidade,
      georref: georref(a.id) === "..." ? "-" : georref(a.id),
      contratado: a.original,
      total: a.total ?? a.original,
      pago: a.pago,
      execucao: a.pct != null ? `${Math.round(a.pct * 100)}%` : "",
    }));

  async function exportarPdf() {
    setErro(null);
    if (acoes.length > LIMITE_LISTA_PDF) {
      setErro(`São ${inteiro(acoes.length)} obras: filtre até ${inteiro(LIMITE_LISTA_PDF)} para gerar o PDF.`);
      return;
    }
    setExportando(true);
    try {
      const resp = await fetch("/api/territorio/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ linhas: linhasPdf(), filtros }) });
      if (!resp.ok) {
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        setErro(json.error ?? "Não foi possível gerar o PDF.");
        return;
      }
      const url = URL.createObjectURL(await resp.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = resp.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "mapa-geral-obras.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setExportando(false);
    }
  }

  const semGeo = acoes.filter((a) => fontes !== null && !fontes[a.id]);
  const [copiou, setCopiou] = useState(false);
  async function copiarSemGeo() {
    try {
      await navigator.clipboard.writeText(semGeo.map((a) => a.id).join("\n"));
      setCopiou(true);
      setTimeout(() => setCopiou(false), 2500);
    } catch {
      setErro("Não consegui copiar. Selecione e copie pela lista.");
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(acoes.length / TAMANHO));
  const atual = Math.min(pagina, totalPaginas);
  const visiveis = acoes.slice((atual - 1) * TAMANHO, atual * TAMANHO);
  const somaContratado = acoes.reduce((s, a) => s + (a.original ?? 0), 0);
  const somaTotal = acoes.reduce((s, a) => s + (a.total ?? a.original ?? 0), 0);
  const somaPago = acoes.reduce((s, a) => s + (a.pago ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-xl border border-black/5 bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary">Lista de obras do filtro</p>
          <p className="text-xs text-ink-muted">
            {inteiro(acoes.length)} obra(s) · contratado {reais(somaContratado)} · total do contrato {reais(somaTotal)} · pago {reais(somaPago)}
            {fontes !== null ? ` · ${inteiro(acoes.length - semGeo.length)} georreferenciada(s), ${inteiro(semGeo.length)} sem` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {semGeo.length > 0 && (
            <button onClick={copiarSemGeo} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane" title="Copia os IDs das obras sem georreferenciamento, para colar em Arquivos KML e baixar em lote">
              {copiou ? "IDs copiados" : `Copiar ${inteiro(semGeo.length)} ID(s) sem KML`}
            </button>
          )}
          <button onClick={exportarPdf} disabled={exportando || acoes.length === 0} className="flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {exportando ? "Gerando PDF..." : "Exportar PDF"}
          </button>
        </div>
      </div>
      {erroFontes && <p className="border-b border-black/5 bg-status-critical/10 px-4 py-2 text-xs text-status-critical">Não foi possível consultar quais obras têm traçado: {erroFontes}</p>}
      {muitas && <p className="border-b border-black/5 bg-status-warning-bg px-4 py-2 text-xs text-status-warning">Com mais de {inteiro(LIMITE_FONTES)} obras, a coluna Georreferenciada não é consultada. Filtre mais para ver quais têm KML.</p>}
      {erro && <p className="border-b border-black/5 bg-status-critical/10 px-4 py-2 text-xs text-status-critical">{erro}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">ID</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="px-3 py-2.5">Órgão</th>
              <th className="px-3 py-2.5">Município(s)</th>
              <th className="px-3 py-2.5">Território(s)</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Tipologia</th>
              <th className="px-3 py-2.5 text-series-1">Unidade</th>
              <th className="px-3 py-2.5 text-right text-series-1">Quantidade</th>
              <th className="px-3 py-2.5">Georreferenciada</th>
              <th className="px-3 py-2.5 text-right">Contratado</th>
              <th className="px-3 py-2.5 text-right">Total do contrato</th>
              <th className="px-3 py-2.5 text-right">Pago</th>
              <th className="px-3 py-2.5 text-right">Exec.</th>
              <th className="px-3 py-2.5">KML</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-ink-muted">
                  Nenhuma obra com os filtros atuais.
                </td>
              </tr>
            )}
            {visiveis.map((a) => {
              const g = georref(a.id);
              const sim = g.startsWith("Sim");
              return (
                <tr key={a.id} className="border-b border-black/5 last:border-0 align-top hover:bg-plane/60">
                  <td className="whitespace-nowrap px-4 py-2">
                    <IdAcaoLink id={a.id} />
                  </td>
                  <td className="max-w-xs px-3 py-2 text-ink-primary">{a.nome}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.orgao ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{descricaoDosMunicipios(a, comPct)}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.partes.length ? descricaoDosTerritorios(a, comPct) : "Sem localização"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.status ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.tipologia ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-series-1">{a.unidade ?? "-"}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium text-series-1">{(a.quantidade != null ? a.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-")}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (sim ? "bg-status-good-bg text-status-good" : g.startsWith("Não") ? "bg-status-critical/10 text-status-critical" : "bg-plane text-ink-muted")}>{g}</span>
                    {resultado[a.id] && <span className="mt-0.5 block text-[10px] text-ink-muted">{resultado[a.id]}</span>}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{reais(a.original)}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{reais(a.total ?? a.original)}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{reais(a.pago)}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right text-ink-secondary">{a.pct != null ? `${Math.round(a.pct * 100)}%` : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      {detalhes && (
                        <button onClick={() => aoAbrirKml(a.id, a.nome)} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-plane" title="Ver os dados da obra">
                          <Info size={13} /> Detalhes
                        </button>
                      )}
                      {!detalhes && sim && (
                        <button onClick={() => aoAbrirKml(a.id, a.nome)} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-plane" title="Ver o traçado guardado no mapa">
                          <MapPinned size={13} /> Ver no mapa
                        </button>
                      )}
                      {sim ? null : ehAdmin ? (
                        <button
                          onClick={() => conferirNoSimo(a.id)}
                          disabled={conferindo[a.id]}
                          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-60"
                          title="Vai ao SIMO ver se a obra tem KML e, se tiver, já baixa e guarda"
                        >
                          {conferindo[a.id] ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          {conferindo[a.id] ? "Conferindo..." : "Conferir no SIMO"}
                        </button>
                      ) : (
                        <span className="text-[10px] text-ink-muted">Conferir no SIMO: só admin e chefe</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-black/5 px-4 py-2.5 text-xs text-ink-muted">
        <span>
          {inteiro(acoes.length)} obra(s) · página {atual} de {totalPaginas}
        </span>
        <span className="flex gap-2">
          <button disabled={atual <= 1} onClick={() => setPagina(atual - 1)} className="rounded-full border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
            Anterior
          </button>
          <button disabled={atual >= totalPaginas} onClick={() => setPagina(atual + 1)} className="rounded-full border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
            Próxima
          </button>
        </span>
      </div>
    </section>
  );
}

// ---------- detalhes da obra (janela do Mapa de Recursos Hídricos) ----------

function DetalhesAcao({ acao, comPct, aoFechar }: { acao: AcaoT | undefined; comPct: boolean; aoFechar: () => void }) {
  const campoDet = (rotulo: string, valor: React.ReactNode) => (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-primary">{valor === "" || valor == null ? "-" : valor}</dd>
    </div>
  );
  const a = acao;
  const valorFinalDaObra = a ? (a.total ?? a.original) : null;
  const aditivoValor = a && a.original != null && valorFinalDaObra != null ? valorFinalDaObra - a.original : null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary">Obra {a?.id}</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{a?.nome}</p>
          </div>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {!a ? (
          <p className="text-xs text-ink-muted">Não encontrei os dados desta obra no filtro atual.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {campoDet("Órgão", a.orgao)}
              {campoDet("Tipologia", a.tipologia)}
              {campoDet("Status", a.status)}
              {campoDet("Estágio atual", a.estagio)}
              {campoDet("Execução", a.pct != null ? `${Math.round(a.pct * 100)}%` : "")}
              {campoDet("Vinculação SIAFE", vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número")}
              {campoDet("Município(s)", descricaoDosMunicipios(a, comPct))}
              {campoDet("Território(s)", a.partes.length ? descricaoDosTerritorios(a, comPct) : "Sem localização")}
              {campoDet("Extensão do traçado", a.extensaoM ? `${(a.extensaoM / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : "")}
              {campoDet("Criada em", dataBR(a.criadaEm))}
              {campoDet("Recebida em", dataBR(a.recProv || a.recDef))}
              {campoDet("Classificação", a.classificacao)}
            </dl>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-plane p-3 sm:grid-cols-4">
              {campoDet("Valor contratado", reais(a.original))}
              {campoDet("Total do contrato", reais(valorFinalDaObra))}
              {campoDet("Aditivo", aditivoValor == null ? "-" : `${aditivoValor > 0.005 ? "+" : ""}${reais(aditivoValor)}`)}
              {campoDet("Valor pago", reais(a.pago))}
            </dl>
            {a.pago != null && valorFinalDaObra != null && valorFinalDaObra > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-ink-muted">
                  <span>Pago do total do contrato</span>
                  <span className="tabular">{((a.pago / valorFinalDaObra) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                </div>
                <div className="h-2 rounded bg-black/5">
                  <div className="h-2 rounded bg-status-good" style={{ width: `${Math.min(100, (a.pago / valorFinalDaObra) * 100)}%` }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MapaDosTracados({ dados, contornos, infoPorId, corPor, aoAbrir }: { dados: DadosTracados; contornos: { nome: string; linhas: [number, number][][] }[]; infoPorId: Map<string, AcaoT>; corPor: "status" | "territorio"; aoAbrir: (id: string, nome: string) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [cheia, setCheia] = useState(false);
  const abrir = useRef(aoAbrir);
  abrir.current = aoAbrir;
  useEffect(() => {
    let mapa: MapaDoLeaflet | null = null;
    let cancelado = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelado || !divRef.current) return;
      // Canvas: milhares de linhas sem pesar (em vez de um elemento por linha).
      mapa = L.map(divRef.current, { preferCanvas: true });
      // Tela cheia (e qualquer mudança de tamanho): o mapa se ajusta ao novo espaço.
      roRef.current = new ResizeObserver(() => mapa?.invalidateSize());
      roRef.current.observe(divRef.current);
      mapa.setView([-7.5, -43], 6);
      adicionarBases(L, mapa, 44);
      for (const t of contornos) {
        for (const l of t.linhas) if (Array.isArray(l) && l.length > 1) L.polyline(l, { color: "#374151", weight: 2, dashArray: "8 6", opacity: 0.6, interactive: false }).addTo(mapa);
      }
      const grupo = L.featureGroup().addTo(mapa);
      let simbolosDesenhados = 0;
      for (const t of dados.acoes) {
        const a = infoPorId.get(t.id);
        const cor = corPor === "status" ? corDoStatus(a?.status) : (COR_TERRITORIO[a ? principal(a) : ""] ?? "#6b7280");
        const dica = `${t.id} - ${a?.nome ?? ""}${a ? " · " + (a.status ?? "sem status") + " · " + descricaoDosTerritorios(a, false) : ""}`;
        const aoClicar = () => abrir.current(t.id, a?.nome ?? "");
        for (const l of t.linhas) {
          if (!Array.isArray(l) || l.length < 2) continue;
          L.polyline(l, { color: cor, weight: 3, opacity: 0.9 }).bindTooltip(dica, { sticky: true }).on("click", aoClicar).addTo(grupo);
        }
        for (const p of t.poligonos) {
          if (!Array.isArray(p) || p.length < 3) continue;
          L.polygon(p, { color: cor, weight: 2, fillColor: cor, fillOpacity: 0.2 }).bindTooltip(dica, { sticky: true }).on("click", aoClicar).addTo(grupo);
        }
        // Pontos: símbolo da tipologia na cor do status. Se forem muitos, só os primeiros ganham símbolo (os demais viram bolinha).
        const g = grupoDaTipologia(a?.tipologia);
        for (const p of t.pontos) {
          if (simbolosDesenhados < LIMITE_SIMBOLOS) {
            simbolosDesenhados++;
            L.marker(p, { icon: L.divIcon({ html: htmlMarcador(g.icone, cor), className: "", iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false })
              .bindTooltip(dica + " · " + g.rotulo, { sticky: true, offset: [10, 0] })
              .on("click", aoClicar)
              .addTo(grupo);
          } else {
            L.circleMarker(p, { radius: 4, color: "#ffffff", weight: 1, fillColor: cor, fillOpacity: 1 }).bindTooltip(dica, { sticky: true }).on("click", aoClicar).addTo(grupo);
          }
        }
      }
      // Enquadra só no que está dentro do Piauí: uma coordenada errada não pode afastar o mapa até o mundo todo.
      const emRegiao: [number, number][] = [];
      for (const t of dados.acoes) {
        for (const l of t.linhas) for (const p of l) if (naRegiao(p)) emRegiao.push(p);
        for (const p of t.pontos) if (naRegiao(p)) emRegiao.push(p);
        for (const l of t.poligonos) for (const p of l) if (naRegiao(p)) emRegiao.push(p);
      }
      const bounds = emRegiao.length > 0 ? L.latLngBounds(emRegiao) : grupo.getBounds();
      const enquadrar = () => {
        if (cancelado || !mapa) return;
        mapa.invalidateSize();
        try {
          if (bounds.isValid()) mapa.fitBounds(bounds, { padding: [20, 20] });
        } catch (e) {
          console.error("mapa de traçados (enquadrar):", e);
        }
      };
      enquadrar();
      setTimeout(enquadrar, 200);
    })();
    return () => {
      cancelado = true;
      roRef.current?.disconnect();
      mapa?.remove();
    };
  }, [dados, contornos, infoPorId, corPor]);

  // Esc sai da tela cheia.
  useEffect(() => {
    if (!cheia) return;
    const sair = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCheia(false);
    };
    window.addEventListener("keydown", sair);
    return () => window.removeEventListener("keydown", sair);
  }, [cheia]);

  return (
    <div className={cheia ? "fixed inset-0 z-[1500] bg-surface p-3" : "relative"}>
      <div ref={divRef} className={"relative z-0 w-full overflow-hidden rounded-lg border border-black/5 " + (cheia ? "h-full" : "h-[38rem]")} />
      <button
        onClick={() => setCheia((c) => !c)}
        className={"absolute z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 bg-white text-ink-secondary shadow hover:bg-plane " + (cheia ? "right-6 top-6" : "right-3 top-3")}
        title={cheia ? "Sair da tela cheia (Esc)" : "Ver o mapa em tela cheia"}
        aria-label={cheia ? "Sair da tela cheia" : "Mapa em tela cheia"}
      >
        {cheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </div>
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
      adicionarBases(L, mapa);
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
  return <div ref={divRef} className="relative z-0 h-[34rem] w-full overflow-hidden rounded-lg border border-black/5" />;
}

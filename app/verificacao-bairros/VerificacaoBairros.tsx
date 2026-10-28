"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, MapPinned, RefreshCw, Search, X } from "lucide-react";
import type { Map as MapaLeaflet } from "leaflet";
import { IdAcaoLink } from "@/components/IdAcaoLink";

export type LinhaLista = {
  id_acao: string;
  fonte: "sobreposicoes" | "kml" | "mapa";
  extensao_m: number;
  metros_fora: number;
  municipio: string | null;
  bairro: string | null;
  metros: number | null;
  pct: number | null;
  pontos: number | null;
  pontos_fora: number | null;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
};

export type ItemLista = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  fonte: "sobreposicoes" | "kml" | "mapa";
  extensaoM: number;
  metrosFora: number;
  pontosFora: number;
  criadaEm: string | null;
  anoConclusao: string;
  semBairro: { municipio: string; metros: number; pct: number; pontos: number }[];
  bairros: { municipio: string; bairro: string; metros: number; pct: number; pontos: number }[];
};

const TAMANHO = 50;
const SEM_BAIRRO = "(sem bairro mapeado)";
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const porcento = (v: number) => `${Math.round(v * 100)}%`;
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

type Situacao = "todas" | "um" | "varios" | "parte_fora" | "sem";

function situacaoDe(i: ItemLista): Exclude<Situacao, "todas"> {
  if (i.bairros.length === 0) return "sem";
  if (i.bairros.length > 1) return "varios";
  return "um";
}
const metrosSemBairro = (i: ItemLista) => i.metrosFora + i.semBairro.reduce((s, x) => s + x.metros, 0);
const pontosSemBairro = (i: ItemLista) => i.pontosFora + i.semBairro.reduce((s, x) => s + x.pontos, 0);
const parteFora = (i: ItemLista) => i.bairros.length > 0 && ((i.extensaoM > 0 && metrosSemBairro(i) / i.extensaoM >= 0.1) || pontosSemBairro(i) > 0);
// O que não cai nem em município do Piauí.
const foraDoMapa = (i: ItemLista) => (i.extensaoM > 0 && i.metrosFora / i.extensaoM >= 0.1) || i.pontosFora > 0;
const textoForaDoMapa = (i: ItemLista) =>
  [i.extensaoM > 0 && i.metrosFora / i.extensaoM >= 0.1 ? `${porcento(i.metrosFora / i.extensaoM)} do trecho` : "", i.pontosFora > 0 ? `${i.pontosFora} ponto(s)` : ""].filter(Boolean).join(" e ") + " fora do Piauí";
const VAZIO = "(vazio)";
const anoDe = (d: string | null) => (d ? d.slice(0, 4) : VAZIO);
const dataBR = (d: string | null) => {
  if (!d) return "-";
  const p = d.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};
const detalhe = (b: { pct: number; pontos: number }, extensaoM: number) =>
  [extensaoM > 0 ? porcento(b.pct) : "", b.pontos > 0 ? `${b.pontos} ponto${b.pontos > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");

export function VerificacaoBairros({ itens, ehAdmin, resumo }: { itens: ItemLista[]; ehAdmin: boolean; resumo: { verificadas: number; pendentes: number; ultima: string | null } | null }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [orgao, setOrgao] = useState("");
  const [status, setStatus] = useState("");
  const [fonte, setFonte] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  // null = todos os anos marcados.
  const [anosCriacao, setAnosCriacao] = useState<Set<string> | null>(null);
  const [anosConclusao, setAnosConclusao] = useState<Set<string> | null>(null);
  const [pagina, setPagina] = useState(1);
  const [verMapa, setVerMapa] = useState<{ id: string; nome: string; bairroFoco?: string } | null>(null);

  const [exportando, setExportando] = useState(false);
  const [erroExcel, setErroExcel] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Opções dos filtros (município e bairro vêm do que foi verificado).
  const municipios = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itens) for (const b of new Set([...i.bairros.map((x) => x.municipio), ...i.semBairro.map((x) => x.municipio)])) m.set(b, (m.get(b) ?? 0) + 1);
    return Array.from(m, ([nome, qtd]) => ({ nome, qtd })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [itens]);
  const bairrosDoMunicipio = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itens) for (const b of i.bairros) if (!municipio || b.municipio === municipio) m.set(b.bairro, (m.get(b.bairro) ?? 0) + 1);
    return Array.from(m, ([nome, qtd]) => ({ nome, qtd })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [itens, municipio]);
  const orgaos = useMemo(() => Array.from(new Set(itens.map((i) => i.orgao).filter(Boolean) as string[])).sort(), [itens]);
  const opcoesAno = (valor: (i: ItemLista) => string) => {
    const m = new Map<string, number>();
    for (const i of itens) m.set(valor(i), (m.get(valor(i)) ?? 0) + 1);
    return Array.from(m, ([valor, qtd]) => ({ valor, qtd })).sort((a, b) => (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : a.valor.localeCompare(b.valor)));
  };
  const opcoesCriacao = useMemo(() => opcoesAno((i) => anoDe(i.criadaEm)), [itens]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoesConclusao = useMemo(() => opcoesAno((i) => i.anoConclusao), [itens]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusLista = useMemo(() => Array.from(new Set(itens.map((i) => i.status).filter(Boolean) as string[])).sort(), [itens]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .filter((i) => {
        if (termo && !(i.id.includes(termo) || i.nome.toLowerCase().includes(termo) || i.bairros.some((b) => (b.municipio + " " + b.bairro).toLowerCase().includes(termo)) || i.semBairro.some((b) => b.municipio.toLowerCase().includes(termo)))) return false;
        if (municipio === SEM_BAIRRO ? i.bairros.length > 0 : municipio && !i.bairros.some((b) => b.municipio === municipio) && !i.semBairro.some((b) => b.municipio === municipio)) return false;
        if (bairro && !i.bairros.some((b) => b.bairro === bairro && (!municipio || municipio === SEM_BAIRRO || b.municipio === municipio))) return false;
        if (orgao && i.orgao !== orgao) return false;
        if (status && i.status !== status) return false;
        if (fonte && i.fonte !== fonte) return false;
        if (anosCriacao && !anosCriacao.has(anoDe(i.criadaEm))) return false;
        if (anosConclusao && !anosConclusao.has(i.anoConclusao)) return false;
        if (situacao === "parte_fora" ? !parteFora(i) : situacao !== "todas" && situacaoDe(i) !== situacao) return false;
        return true;
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [itens, busca, municipio, bairro, orgao, status, fonte, situacao, anosCriacao, anosConclusao]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * TAMANHO, paginaAtual * TAMANHO);
  const mudar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };

  // Excel com as ações que estão na lista (com os filtros de agora).
  async function exportarExcel() {
    setExportando(true);
    setErroExcel(null);
    try {
      const filtros = [
        busca && `Busca: "${busca}"`,
        anosCriacao && `Ano de criação: ${Array.from(anosCriacao).sort().join(", ") || "nenhum"}`,
        anosConclusao && `Ano de conclusão: ${Array.from(anosConclusao).sort().join(", ") || "nenhum"}`,
        municipio && `Município: ${municipio}`,
        bairro && `Bairro: ${bairro}`,
        orgao && `Órgão: ${orgao}`,
        status && `Status: ${status}`,
        situacao !== "todas" && `Situação: ${{ um: "dentro de um só bairro", varios: "passa por mais de um bairro", parte_fora: "parte fora dos bairros", sem: "sem bairro mapeado" }[situacao]}`,
        fonte && `Origem do traçado: ${{ sobreposicoes: "linhas do mapa", kml: "KML guardado", mapa: "pontos ou polígonos do mapa" }[fonte] ?? fonte}`,
      ].filter(Boolean);
      const resp = await fetch("/api/bairros/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: filtradas.map((i) => i.id), filtros }),
        credentials: "same-origin",
      });
      if (!resp.ok) {
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        setErroExcel(json.error ?? "Não foi possível gerar o Excel.");
        return;
      }
      const blob = await resp.blob();
      const nome = resp.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "verificacao-bairros.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErroExcel("Sem conexão com o servidor.");
    } finally {
      setExportando(false);
    }
  }

  // Calcula em lotes curtos: cada chamada trabalha uns 40 s e a tela chama de novo até acabar.
  async function atualizar(refazer = false) {
    setAtualizando(true);
    setMsg(null);
    let total = 0;
    let comBairro = 0;
    let semBairro = 0;
    let infoMapa = "";
    try {
      for (let rodada = 0; rodada < 60; rodada++) {
        const resp = await fetch("/api/bairros/atualizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baixarMapa: rodada === 0, refazerTudo: refazer && rodada === 0 }),
        });
        const texto = await resp.text();
        let json: { error?: string; processadas?: number; comBairro?: number; semBairro?: number; terminou?: boolean; pontosPoligonosDoMapa?: string } = {};
        try {
          json = JSON.parse(texto);
        } catch {
          // resposta que não é do nosso código (ex.: tempo esgotado na hospedagem)
        }
        if (!resp.ok) {
          setMsg({ tipo: "erro", texto: (json.error ?? `O servidor respondeu ${resp.status}${texto && !texto.startsWith("<") ? ": " + texto.slice(0, 160) : ""}`) + (total > 0 ? ` Já foram calculadas ${inteiro(total)} ação(ões); clique de novo para continuar.` : "") });
          router.refresh();
          return;
        }
        total += json.processadas ?? 0;
        comBairro += json.comBairro ?? 0;
        semBairro += json.semBairro ?? 0;
        if (json.pontosPoligonosDoMapa) infoMapa = json.pontosPoligonosDoMapa;
        if (json.terminou || (json.processadas ?? 0) === 0) {
          setMsg({ tipo: "ok", texto: `${inteiro(total)} ação(ões) calculada(s) (${inteiro(comBairro)} com bairro, ${inteiro(semBairro)} sem).` + (infoMapa ? ` Mapa: ${infoMapa}.` : "") });
          router.refresh();
          return;
        }
        setMsg({ tipo: "ok", texto: `Calculando... ${inteiro(total)} ação(ões) até agora.` });
      }
      setMsg({ tipo: "ok", texto: `${inteiro(total)} ação(ões) calculadas. Clique de novo para continuar.` });
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "Sem conexão com o servidor." + (total > 0 ? ` Já foram calculadas ${inteiro(total)}; clique de novo para continuar.` : "") });
    } finally {
      setAtualizando(false);
    }
  }

  const contagem = {
    um: filtradas.filter((i) => situacaoDe(i) === "um").length,
    varios: filtradas.filter((i) => situacaoDe(i) === "varios").length,
    sem: filtradas.filter((i) => situacaoDe(i) === "sem").length,
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Cruza o que está guardado de cada ação (linhas, pontos e polígonos do mapa de obras; o KML baixado do SIMO completa o que o mapa não tem) com os limites dos bairros. O resultado fica guardado e só é refeito quando o traçado muda: a atualização diária (04:15) cuida disso sozinha.
            {resumo && (
              <>
                {" "}
                <strong className="text-ink-secondary">{inteiro(resumo.verificadas)}</strong> verificada(s)
                {resumo.pendentes > 0 ? (
                  <>
                    , <strong className="text-status-warning">{inteiro(resumo.pendentes)}</strong> aguardando cálculo
                  </>
                ) : (
                  ", nada pendente"
                )}
                {resumo.ultima ? `. Último cálculo em ${new Date(resumo.ultima).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.` : "."}
              </>
            )}
          </p>
          {ehAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => atualizar(false)} disabled={atualizando} className="flex items-center gap-1.5 rounded-full bg-series-1 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {atualizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {atualizando ? "Calculando..." : "Atualizar verificação"}
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Refazer o cálculo de todas as ações? Leva alguns minutos; o que está na tela só muda quando terminar.")) atualizar(true);
                }}
                disabled={atualizando}
                className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-60"
                title="Esquece os cálculos guardados e refaz todos (use depois de uma mudança na regra de cálculo)"
              >
                Refazer tudo
              </button>
            </div>
          )}
        </div>
        {msg && <p className={"mt-2 text-xs font-medium " + (msg.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{msg.texto}</p>}
      </section>

      {/* Filtros */}
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input value={busca} onChange={(e) => mudar(setBusca)(e.target.value)} placeholder="ID, nome, município ou bairro..." className={campo + " w-64 pl-9"} />
          </label>
          <select
            value={municipio}
            onChange={(e) => {
              setMunicipio(e.target.value);
              setBairro("");
              setPagina(1);
            }}
            className={campo}
          >
            <option value="">Todos os municípios</option>
            <option value={SEM_BAIRRO}>{SEM_BAIRRO}</option>
            {municipios.map((m) => (
              <option key={m.nome} value={m.nome}>
                {m.nome} ({m.qtd})
              </option>
            ))}
          </select>
          <select value={bairro} onChange={(e) => mudar(setBairro)(e.target.value)} disabled={municipio === SEM_BAIRRO} className={campo}>
            <option value="">{municipio && municipio !== SEM_BAIRRO ? `Todos os bairros de ${municipio}` : "Todos os bairros"}</option>
            {bairrosDoMunicipio.map((b) => (
              <option key={b.nome} value={b.nome}>
                {b.nome} ({b.qtd})
              </option>
            ))}
          </select>
          <select value={orgao} onChange={(e) => mudar(setOrgao)(e.target.value)} className={campo}>
            <option value="">Todos os órgãos</option>
            {orgaos.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => mudar(setStatus)(e.target.value)} className={campo}>
            <option value="">Todos os status</option>
            {statusLista.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={situacao} onChange={(e) => mudar(setSituacao)(e.target.value as Situacao)} className={campo}>
            <option value="todas">Qualquer situação</option>
            <option value="um">Dentro de um só bairro</option>
            <option value="varios">Passa por mais de um bairro</option>
            <option value="parte_fora">Parte do trecho fora dos bairros</option>
            <option value="sem">Sem bairro mapeado</option>
          </select>
          <select value={fonte} onChange={(e) => mudar(setFonte)(e.target.value)} className={campo}>
            <option value="">Qualquer origem do traçado</option>
            <option value="sobreposicoes">Linhas do mapa</option>
            <option value="kml">KML guardado</option>
            <option value="mapa">Só pontos ou polígonos do mapa</option>
          </select>
          <FiltroCheckbox rotulo="Ano de criação" opcoes={opcoesCriacao} selecionados={anosCriacao} aoMudar={(v) => mudar(setAnosCriacao)(v)} />
          <FiltroCheckbox rotulo="Ano de conclusão" opcoes={opcoesConclusao} selecionados={anosConclusao} aoMudar={(v) => mudar(setAnosConclusao)(v)} />
          {(busca || municipio || bairro || orgao || status || situacao !== "todas" || fonte || anosCriacao || anosConclusao) && (
            <button
              onClick={() => {
                setBusca("");
                setMunicipio("");
                setBairro("");
                setOrgao("");
                setStatus("");
                setSituacao("todas");
                setFonte("");
                setAnosCriacao(null);
                setAnosConclusao(null);
                setPagina(1);
              }}
              className="text-xs font-medium text-series-1 hover:underline"
            >
              limpar filtros
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(itens.length)} ação(ões) · {inteiro(contagem.um)} em um só bairro · {inteiro(contagem.varios)} em mais de um · {inteiro(contagem.sem)} sem bairro mapeado
        </p>
        <button
          onClick={exportarExcel}
          disabled={exportando || filtradas.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          title="Baixa as ações da lista, com os filtros de agora"
        >
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {exportando ? "Gerando..." : "Exportar Excel"}
        </button>
        </div>
        {erroExcel && <p className="mt-2 text-xs font-medium text-status-critical">{erroExcel}</p>}
      </section>

      {/* Lista */}
      <section className="rounded-xl border border-black/5 bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Órgão</th>
                <th className="px-4 py-3">Criada em</th>
                <th className="px-4 py-3">Ano de conclusão</th>
                <th className="px-4 py-3">Município - Bairro</th>
                <th className="px-4 py-3">KML</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => (
                <tr key={i.id} className="border-b border-black/5 align-top last:border-0 hover:bg-plane/60">
                  <td className="tabular px-4 py-3 font-medium text-ink-primary">
                    <IdAcaoLink id={i.id} />
                  </td>
                  <td className="max-w-md px-4 py-3 text-ink-secondary">
                    <span className="block">{i.nome}</span>
                    {i.status && <span className="text-[11px] text-ink-muted">{i.status}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{i.orgao ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">{dataBR(i.criadaEm)}</td>
                  <td className="px-4 py-3 text-ink-secondary">{i.anoConclusao === VAZIO ? "-" : i.anoConclusao}</td>
                  <td className="px-4 py-3">
                    {i.bairros.length === 0 && i.semBairro.length === 0 && !foraDoMapa(i) ? (
                      <span className="rounded-full bg-status-neutral-bg px-2 py-0.5 text-xs font-medium text-status-neutral" title="O trecho não cai em nenhum bairro do arquivo (município sem bairros mapeados ou fora dos limites)">
                        {SEM_BAIRRO}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {i.bairros.map((b) => {
                          const foco = bairro && b.bairro === bairro;
                          return (
                            <button
                              key={b.municipio + b.bairro}
                              onClick={() => setVerMapa({ id: i.id, nome: i.nome, bairroFoco: b.bairro })}
                              title={`${inteiro(b.metros)} m e ${b.pontos} ponto(s) dentro deste bairro. Clique para ver no mapa.`}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80 ${foco ? "bg-series-1 text-white" : "bg-status-good-bg text-status-good"}`}
                            >
                              {b.municipio} - {b.bairro} <span className="opacity-70">({detalhe(b, i.extensaoM)})</span>
                            </button>
                          );
                        })}
                        {i.semBairro.map((s) => (
                          <button
                            key={s.municipio}
                            onClick={() => setVerMapa({ id: i.id, nome: i.nome })}
                            title={`${inteiro(s.metros)} m e ${s.pontos} ponto(s) em ${s.municipio}, fora dos bairros do arquivo. Clique para ver no mapa.`}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80 ${i.bairros.length > 0 ? "bg-status-warning-bg text-status-warning" : "bg-status-neutral-bg text-status-neutral"}`}
                          >
                            {s.municipio} - sem bairro mapeado <span className="opacity-70">({detalhe(s, i.extensaoM)})</span>
                          </button>
                        ))}
                        {foraDoMapa(i) && (
                          <span className="rounded-full bg-status-critical/10 px-2.5 py-0.5 text-xs font-medium text-status-critical" title="Não cai em nenhum município do Piauí: confira o traçado">
                            {textoForaDoMapa(i)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setVerMapa({ id: i.id, nome: i.nome })}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-plane"
                      title={i.fonte === "kml" ? "Traçado: KML guardado" : i.fonte === "mapa" ? "Pontos e polígonos do mapa de obras" : "Traçado: mapa de obras"}
                    >
                      <MapPinned size={13} /> Verificar KML
                    </button>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted">
                    {itens.length === 0 ? "Nenhuma ação verificada ainda. Rode o SQL 0081 e clique em Atualizar verificação." : "Nenhuma ação com esses filtros."}
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

      {verMapa && <JanelaMapa id={verMapa.id} nome={verMapa.nome} bairroFoco={verMapa.bairroFoco} aoFechar={() => setVerMapa(null)} />}
    </div>
  );
}

// ---------- mapa: o traçado da ação e o contorno dos bairros ----------

type DadosMapa = {
  fonte: "sobreposicoes" | "kml" | "mapa";
  extensaoM: number;
  metrosFora: number;
  pontosFora: number;
  totalPontos: number;
  linhas: [number, number][][];
  pontos: [number, number][];
  contornos: [number, number][][];
  bairros: { municipio: string; bairro: string; metros: number; pct: number; pontos: number; aneis: [number, number][][] }[];
};

const CORES = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#4f46e5"];

function JanelaMapa({ id, nome, bairroFoco, aoFechar }: { id: string; nome: string; bairroFoco?: string; aoFechar: () => void }) {
  const [dados, setDados] = useState<DadosMapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resp = await fetch(`/api/bairros/mapa?id=${encodeURIComponent(id)}`);
        const json = (await resp.json().catch(() => ({}))) as DadosMapa & { error?: string };
        if (cancelado) return;
        if (!resp.ok) setErro(json.error ?? "Não foi possível carregar o mapa.");
        else setDados(json);
      } catch {
        if (!cancelado) setErro("Sem conexão com o servidor.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary">
              Verificar KML · ação {id}
            </p>
            <p className="truncate text-xs text-ink-muted" title={nome}>
              {nome}
            </p>
          </div>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {erro && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erro}</p>}
        {!dados && !erro && (
          <p className="flex items-center gap-2 py-10 text-xs text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> Carregando o mapa...
          </p>
        )}
        {dados && (
          <>
            <MapaBairros dados={dados} bairroFoco={bairroFoco} />
            <p className="mt-3 text-xs text-ink-muted">
              Traçado: {dados.fonte === "kml" ? "KML guardado" : dados.fonte === "mapa" ? "pontos e polígonos do mapa de obras" : "mapa de obras"} · {(dados.extensaoM / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km · {dados.totalPontos} ponto(s) do KML.{" "}
              {dados.bairros.length === 0 ? "Não cai em nenhum bairro mapeado." : ""}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {dados.bairros.map((b, i) => (
                <li key={b.municipio + b.bairro} className="flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 text-xs text-ink-secondary">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.bairro === "" ? "#6b7280" : CORES[i % CORES.length] }} />
                  {b.municipio} - {b.bairro || "sem bairro mapeado"}: {dados.extensaoM > 0 ? `${inteiro(b.metros)} m (${porcento(b.pct)})` : ""}{dados.extensaoM > 0 && b.pontos > 0 ? " + " : ""}{b.pontos > 0 ? `${b.pontos} ponto${b.pontos > 1 ? "s" : ""}` : ""}
                </li>
              ))}
              {(dados.metrosFora > 0 || dados.pontosFora > 0) && dados.bairros.length > 0 && (
                <li className="rounded-full border border-status-warning/30 bg-status-warning-bg px-2.5 py-1 text-xs text-status-warning">
                  fora dos bairros: {[dados.metrosFora > 0 ? `${inteiro(dados.metrosFora)} m` : "", dados.pontosFora > 0 ? `${dados.pontosFora} ponto(s)` : ""].filter(Boolean).join(" e ")}
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function MapaBairros({ dados, bairroFoco }: { dados: DadosMapa; bairroFoco?: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mapa: MapaLeaflet | null = null;
    let cancelado = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelado || !divRef.current) return;
      mapa = L.map(divRef.current);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(mapa);
      const todos = L.featureGroup().addTo(mapa);
      dados.bairros.forEach((b, i) => {
        const semBairro = b.bairro === "";
        const cor = semBairro ? "#6b7280" : CORES[i % CORES.length];
        const destaque = !bairroFoco || b.bairro === bairroFoco;
        for (const anel of b.aneis) {
          L.polygon(anel, { color: cor, weight: destaque ? 3 : 1.5, fillColor: cor, fillOpacity: semBairro ? 0.04 : destaque ? 0.18 : 0.06, dashArray: destaque && !semBairro ? undefined : "4 4" })
            .bindTooltip(`${b.municipio} - ${b.bairro || "sem bairro mapeado (contorno do município)"}: ${porcento(b.pct)} do trecho`, { sticky: true })
            .addTo(todos);
        }
      });
      const grupoLinhas = L.featureGroup().addTo(mapa);
      for (const l of dados.linhas) L.polyline(l, { color: "#dc2626", weight: 4, opacity: 0.95 }).addTo(grupoLinhas);
      for (const c of dados.contornos ?? []) L.polygon(c, { color: "#7c3aed", weight: 2, fillOpacity: 0.15 }).addTo(grupoLinhas);
      for (const p of dados.pontos ?? []) L.circleMarker(p, { radius: 6, color: "#ffffff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }).addTo(grupoLinhas);
      const b = grupoLinhas.getBounds();
      const bt = todos.getBounds();
      // Enquadra no traçado (o contorno do município e dos bairros fica visível ao redor).
      const enquadrar = () => {
        mapa?.invalidateSize();
        if (b.isValid()) mapa?.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
        else if (bt.isValid()) mapa?.fitBounds(bt, { padding: [30, 30] });
      };
      enquadrar();
      setTimeout(enquadrar, 200);
      else mapa.setView([-7.5, -43], 6);
    })();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [dados, bairroFoco]);
  return <div ref={divRef} className="h-[28rem] w-full overflow-hidden rounded-lg border border-black/5" />;
}

// ---------- filtro com caixas de seleção (como no Excel) ----------

function FiltroCheckbox({
  rotulo,
  opcoes,
  selecionados,
  aoMudar,
}: {
  rotulo: string;
  opcoes: { valor: string; qtd: number }[];
  selecionados: Set<string> | null; // null = todos marcados
  aoMudar: (v: Set<string> | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const marcar = (valor: string, marcado: boolean) => {
    const atual = new Set(selecionados ?? opcoes.map((o) => o.valor));
    if (marcado) atual.add(valor);
    else atual.delete(valor);
    aoMudar(atual.size === opcoes.length ? null : atual);
  };
  const resumo = selecionados === null ? "todos" : selecionados.size === 0 ? "nenhum" : selecionados.size <= 3 ? Array.from(selecionados).sort().join(", ") : `${selecionados.size} de ${opcoes.length}`;

  return (
    <div ref={raiz} className="relative">
      <button onClick={() => setAberto((a) => !a)} className={campo + " flex items-center gap-2 " + (selecionados ? "border-series-1 text-series-1" : "")}>
        {rotulo}: <strong className="font-semibold">{resumo}</strong>
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1.5 w-56 rounded-xl border border-black/10 bg-surface p-2 shadow-card">
          <div className="mb-1.5 flex items-center justify-between px-1 text-[11px]">
            <button onClick={() => aoMudar(null)} className="font-medium text-series-1 hover:underline">
              Marcar todos
            </button>
            <button onClick={() => aoMudar(new Set())} className="font-medium text-ink-muted hover:underline">
              Limpar
            </button>
          </div>
          <ul className="max-h-60 space-y-0.5 overflow-y-auto pr-1">
            {opcoes.map((o) => (
              <li key={o.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink-secondary hover:bg-plane">
                  <input type="checkbox" checked={selecionados ? selecionados.has(o.valor) : true} onChange={(e) => marcar(o.valor, e.target.checked)} className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{o.valor}</span>
                  <span className="tabular shrink-0 text-[10px] text-ink-muted">{inteiro(o.qtd)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

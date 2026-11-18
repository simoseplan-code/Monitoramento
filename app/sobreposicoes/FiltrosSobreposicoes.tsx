"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, Search, Send, X } from "lucide-react";
import { hrefSobre, qtdFiltrosAtivos, type FiltrosSobre } from "@/lib/sobreposicoes/filtros";

const ABAS = [
  { valor: "pendente", rotulo: "Aguardando revisão", ativa: "bg-series-1 text-white" },
  { valor: "ok", rotulo: "Sem problema", ativa: "bg-status-good text-white" },
  { valor: "problema", rotulo: "Com problema", ativa: "bg-status-warning text-white" },
  { valor: "solucionado", rotulo: "Solucionado", ativa: "bg-series-7 text-white" },
] as const;

const GRUPOS = [
  { valor: "andamento", rotulo: "Em andamento", dica: "Pares com pelo menos uma obra ainda não concluída" },
  { valor: "concluidas", rotulo: "Concluída × Concluída", dica: "Pares em que todas as obras estão com status Concluído" },
] as const;

const campo = "w-full rounded-lg border border-black/10 bg-plane px-2.5 py-1.5 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";

// Faixa de cima: grupo (em andamento / concluída), a aba de Pendências e as abas de status, com os números.
export function BarraSobreposicoes({
  filtros,
  contagens,
  pendentesPorGrupo,
  pendencias,
  cgfr,
}: {
  filtros: FiltrosSobre;
  contagens: { pendente: number; ok: number; problema: number; solucionado: number };
  pendentesPorGrupo: Record<string, number>;
  /** Total dos dois grupos juntos: pares com problema a resolver e já solucionados. */
  pendencias: { aguardando: number; solucionados: number };
  /** Pares enviados ao CGFR (mesmos números, outro destino). */
  cgfr: { aguardando: number; solucionados: number };
}) {
  const nasPendencias = filtros.aba === "pendencias";
  const noCgfr = filtros.aba === "cgfr";
  const numeros = noCgfr ? cgfr : pendencias;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {GRUPOS.map((g) => {
          const ativo = !nasPendencias && !noCgfr && filtros.grupo === g.valor;
          return (
            <Link
              key={g.valor}
              href={hrefSobre({ ...filtros, aba: "analise", grupo: g.valor, status: "pendente" })}
              title={g.dica}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                ativo ? "border border-series-1 bg-series-1/10 text-series-1" : "border border-black/10 bg-surface text-ink-secondary hover:bg-plane"
              }`}
            >
              {g.rotulo} <span className="tabular font-normal opacity-80">({pendentesPorGrupo[g.valor] ?? 0} aguardando)</span>
            </Link>
          );
        })}
        <Link
          href={hrefSobre({ ...filtros, aba: "pendencias", status: "problema" })}
          title="Pares marcados com problema, a resolver: lista, resumo por órgão e relatórios"
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            nasPendencias ? "border border-status-warning bg-status-warning text-white shadow-card" : "border border-status-warning/40 bg-status-warning-bg text-status-warning hover:bg-status-warning/20"
          }`}
        >
          <AlertTriangle size={15} />
          Pendências
          <span className={`tabular rounded-full px-2 py-0.5 text-xs ${nasPendencias ? "bg-white/25 text-white" : "bg-status-warning/15"}`}>{pendencias.aguardando}</span>
        </Link>
        <Link
          href={hrefSobre({ ...filtros, aba: "cgfr", status: "problema" })}
          title="Pares enviados ao CGFR: lista, resumo por órgão e relatórios"
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            noCgfr ? "border border-status-critical bg-status-critical text-white shadow-card" : "border border-status-critical/40 bg-status-critical-bg text-status-critical hover:bg-status-critical/20"
          }`}
        >
          <Send size={15} />
          CGFR
          <span className={`tabular rounded-full px-2 py-0.5 text-xs ${noCgfr ? "bg-white/25 text-white" : "bg-status-critical/15"}`}>{cgfr.aguardando}</span>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-black/5 bg-surface p-3 shadow-card">
        {nasPendencias || noCgfr
          ? ([
              { valor: "problema", rotulo: "Aguardando solução", n: numeros.aguardando, ativa: noCgfr ? "bg-status-critical text-white" : "bg-status-warning text-white" },
              { valor: "solucionado", rotulo: "Já solucionadas", n: numeros.solucionados, ativa: "bg-series-7 text-white" },
            ] as const).map((a) => (
              <Link
                key={a.valor}
                href={hrefSobre({ ...filtros, status: a.valor })}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${filtros.status === a.valor ? a.ativa : "border border-black/10 text-ink-secondary hover:bg-plane"}`}
              >
                {a.rotulo} <span className="tabular opacity-80">({a.n})</span>
              </Link>
            ))
          : ABAS.map((a) => {
              const ativa = filtros.status === a.valor;
              return (
                <Link
                  key={a.valor}
                  href={hrefSobre({ ...filtros, status: a.valor })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${ativa ? a.ativa : "border border-black/10 text-ink-secondary hover:bg-plane"}`}
                >
                  {a.rotulo} <span className="tabular opacity-80">({contagens[a.valor]})</span>
                </Link>
              );
            })}
      </div>
    </div>
  );
}

// Lista de caixas de seleção (nenhuma marcada = sem filtro).
function GrupoCaixas({
  titulo,
  dica,
  opcoes,
  marcados,
  aoMudar,
}: {
  titulo: string;
  dica?: string;
  opcoes: { valor: string; rotulo?: string; qtd?: number }[];
  marcados: string[];
  aoMudar: (v: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return b ? opcoes.filter((o) => (o.rotulo ?? o.valor).toLowerCase().includes(b)) : opcoes;
  }, [opcoes, busca]);
  const alternar = (v: string) => aoMudar(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v]);

  return (
    <details open={marcados.length > 0 || opcoes.length <= 6} className="group rounded-lg border border-black/5 bg-plane/50">
      <summary className="flex cursor-pointer select-none items-center justify-between px-2.5 py-2 text-xs font-semibold text-ink-primary" title={dica}>
        <span>{titulo}</span>
        {marcados.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="rounded-full bg-series-1 px-1.5 py-0.5 text-[10px] font-semibold text-white">{marcados.length}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                aoMudar([]);
              }}
              className="text-ink-muted hover:text-ink-primary"
              title="Limpar este filtro"
            >
              <X size={12} />
            </button>
          </span>
        )}
      </summary>
      <div className="px-2 pb-2">
        {opcoes.length > 8 && (
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className={campo + " mb-1.5"} />
        )}
        <ul className="max-h-44 space-y-0.5 overflow-y-auto pr-1">
          {visiveis.map((o) => (
            <li key={o.valor}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink-secondary hover:bg-plane">
                <input type="checkbox" checked={marcados.includes(o.valor)} onChange={() => alternar(o.valor)} className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={o.rotulo ?? o.valor}>
                  {o.rotulo ?? o.valor}
                </span>
                {o.qtd != null && <span className="tabular shrink-0 text-[10px] text-ink-muted">{o.qtd.toLocaleString("pt-BR")}</span>}
              </label>
            </li>
          ))}
          {visiveis.length === 0 && <li className="px-1 py-1 text-[11px] text-ink-muted">Nada encontrado.</li>}
        </ul>
      </div>
    </details>
  );
}

// Coluna da esquerda: filtros por caixa de seleção. Só aplica ao clicar em "Aplicar filtros".
export function FiltrosLaterais({
  filtros,
  orgaos,
  statusObras,
  tipologias,
  anos,
}: {
  filtros: FiltrosSobre;
  orgaos: string[];
  statusObras: { valor: string; qtd: number }[];
  tipologias: string[];
  anos: number[];
}) {
  const router = useRouter();
  const [rascunho, setRascunho] = useState<FiltrosSobre>(filtros);
  const chave = hrefSobre(filtros);
  useEffect(() => setRascunho(filtros), [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = hrefSobre(rascunho) !== chave;
  const ativos = qtdFiltrosAtivos(filtros);
  const aplicar = () => router.push(hrefSobre(rascunho));
  const limpar = () => router.push(hrefSobre({ ...filtros, orgaos: [], statusObras: [], tipologias: [], anos: [], tipologiaTodas: "", ocultarEstradaVicinal: false, pctMin: "", pctMax: "", busca: "" }));

  return (
    <aside className="sticky top-3 max-h-[calc(100vh-1.5rem)] w-64 shrink-0 space-y-2 overflow-y-auto rounded-xl border border-black/5 bg-surface p-3 shadow-card [scrollbar-width:thin]">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
          <Filter size={14} /> Filtros
          {ativos > 0 && <span className="rounded-full bg-series-1 px-1.5 py-0.5 text-[10px] font-semibold text-white">{ativos}</span>}
        </p>
        {ativos > 0 && (
          <button onClick={limpar} className="text-[11px] font-medium text-series-1 hover:underline">
            Limpar tudo
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          aplicar();
        }}
        className="relative"
      >
        <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-ink-muted" />
        <input
          value={rascunho.busca}
          onChange={(e) => setRascunho({ ...rascunho, busca: e.target.value })}
          placeholder="Buscar por ID ou nome"
          className={campo + " pl-7"}
        />
      </form>

      <GrupoCaixas titulo="Órgão" opcoes={orgaos.map((o) => ({ valor: o }))} marcados={rascunho.orgaos} aoMudar={(v) => setRascunho({ ...rascunho, orgaos: v })} dica="O par aparece se pelo menos uma das obras for de um órgão marcado" />
      <GrupoCaixas titulo="Status das obras" opcoes={statusObras} marcados={rascunho.statusObras} aoMudar={(v) => setRascunho({ ...rascunho, statusObras: v })} dica="O par aparece se pelo menos uma das obras estiver num status marcado" />

      <div className="rounded-lg border border-black/5 bg-plane/50 px-2.5 py-2">
        <p className="mb-1.5 text-xs font-semibold text-ink-primary" title="Usa a obra mais adiantada do par">
          % de execução
        </p>
        <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span>obra mais adiantada do par:</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
          de
          <input value={rascunho.pctMin} onChange={(e) => setRascunho({ ...rascunho, pctMin: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="0" className={campo + " w-14 text-center"} />
          a
          <input value={rascunho.pctMax} onChange={(e) => setRascunho({ ...rascunho, pctMax: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="100" className={campo + " w-14 text-center"} />
          %
        </div>
        <p className="mt-1 text-[10px] leading-snug text-ink-muted">Ex.: de 50 a 100 mostra pares em que a obra mais adiantada já passou de 50%.</p>
      </div>

      <GrupoCaixas titulo="Tipologia (pelo menos uma)" opcoes={tipologias.map((t) => ({ valor: t }))} marcados={rascunho.tipologias} aoMudar={(v) => setRascunho({ ...rascunho, tipologias: v })} />
      <GrupoCaixas titulo="Ano de criação" opcoes={anos.map((a) => ({ valor: String(a) }))} marcados={rascunho.anos} aoMudar={(v) => setRascunho({ ...rascunho, anos: v })} dica="O par aparece se pelo menos uma das obras foi criada no ano marcado" />

      <label className="block text-xs text-ink-secondary">
        <span className="mb-1 block font-semibold text-ink-primary">Todas as obras são da tipologia</span>
        <select value={rascunho.tipologiaTodas} onChange={(e) => setRascunho({ ...rascunho, tipologiaTodas: e.target.value })} className={campo}>
          <option value="">Qualquer</option>
          {tipologias.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-secondary">
        <input type="checkbox" checked={!rascunho.ocultarEstradaVicinal} onChange={(e) => setRascunho({ ...rascunho, ocultarEstradaVicinal: !e.target.checked })} />
        Mostrar Estrada Vicinal × Estrada Vicinal
      </label>

      <button
        onClick={aplicar}
        className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${mudou ? "bg-series-1 text-white hover:opacity-90" : "border border-black/10 text-ink-muted"}`}
      >
        {mudou ? "Aplicar filtros" : "Filtros aplicados"}
      </button>
    </aside>
  );
}

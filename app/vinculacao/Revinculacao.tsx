"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, RefreshCw, XCircle } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

export type Foto = { total: number | null; pago: number | null; medido: number | null; automatico: string | null };
export type LinhaRev = {
  idAcao: string;
  nomeAcao: string;
  numero: string | null;
  origemNumero: string | null;
  sucesso: boolean;
  resultado: string;
  antes: Foto | null;
  depois: Foto | null;
  quando?: string;
};

const brl = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

function Mudanca({ antes, depois }: { antes: number | null | undefined; depois: number | null | undefined }) {
  if (depois == null) return <span className="text-ink-muted">{brl(antes)}</span>;
  const mudou = antes == null || Math.abs((depois ?? 0) - antes) >= 0.005;
  return (
    <span className="tabular">
      <span className="text-ink-muted">{brl(antes)}</span> <span className="text-ink-muted">→</span> <span className={mudou ? "font-semibold text-status-warning" : "text-ink-secondary"}>{brl(depois)}</span>
      {mudou && antes != null && (
        <span className="ml-1 text-[11px] text-ink-muted">
          ({depois - antes > 0 ? "+" : ""}
          {(depois - antes).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
        </span>
      )}
    </span>
  );
}

function csvEscape(v: string) {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function Revinculacao({ historico }: { historico: LinhaRev[] }) {
  const [texto, setTexto] = useState("");
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<LinhaRev[]>([]);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const parar = useRef(false);

  const ids = Array.from(new Set((texto.match(/\d+/g) ?? []).filter((i) => i.length <= 12)));

  async function revincular() {
    if (ids.length === 0) return;
    if (!window.confirm(`Revincular ${ids.length} ação(ões) no SIMO? Isso grava no SIMO (o mesmo que Vincular Contrato → Salvar).`)) return;
    setRodando(true);
    setErro(null);
    setResultados([]);
    parar.current = false;
    let restantes = ids;
    setProgresso({ feitas: 0, total: ids.length });
    try {
      while (restantes.length > 0 && !parar.current) {
        const resp = await fetch("/api/admin/revincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: restantes }) });
        const json = (await resp.json().catch(() => ({}))) as { error?: string; resultados?: LinhaRev[]; restantes?: string[] };
        if (!resp.ok) {
          setErro(json.error ?? "Falha ao revincular.");
          break;
        }
        const novos = json.resultados ?? [];
        setResultados((r) => [...r, ...novos]);
        restantes = json.restantes ?? [];
        setProgresso({ feitas: ids.length - restantes.length, total: ids.length });
        if (novos.length === 0 && restantes.length > 0) {
          setErro("O servidor não avançou. Tente de novo com os IDs que faltam.");
          break;
        }
      }
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setRodando(false);
    }
  }

  function excel() {
    const cols = ["ID", "Ação", "Número usado", "Origem do número", "Resultado", "Valor total antes", "Valor total depois", "Valor pago antes", "Valor pago depois", "Medido depois"];
    const n = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
    const linhas = resultados.map((r) => [r.idAcao, r.nomeAcao, r.numero ?? "", r.origemNumero ?? "", r.resultado, n(r.antes?.total), n(r.depois?.total), n(r.antes?.pago), n(r.depois?.pago), n(r.depois?.medido)].map((x) => csvEscape(String(x))).join(";"));
    const csv = "﻿" + [cols.join(";"), ...linhas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `revinculacao-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const tabela = (linhas: LinhaRev[], mostrarQuando: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2.5">ID</th>
            <th className="px-3 py-2.5">Ação</th>
            <th className="px-3 py-2.5">Número usado</th>
            <th className="px-3 py-2.5">Resultado</th>
            <th className="px-3 py-2.5">Valor total (antes → depois)</th>
            <th className="px-3 py-2.5">Valor pago (antes → depois)</th>
            <th className="px-3 py-2.5">Medido (SIMO agora)</th>
            {mostrarQuando && <th className="px-3 py-2.5">Quando</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((r, i) => (
            <tr key={r.idAcao + i} className="border-b border-black/5 align-top hover:bg-plane/40">
              <td className="whitespace-nowrap px-4 py-2.5"><IdAcaoLink id={r.idAcao} /></td>
              <td className="max-w-[260px] px-3 py-2.5"><div className="line-clamp-2 text-ink-primary" title={r.nomeAcao}>{r.nomeAcao || "-"}</div></td>
              <td className="px-3 py-2.5 text-ink-secondary">
                {r.numero ?? "-"}
                {r.origemNumero && <div className="text-[10px] text-ink-muted">{r.origemNumero}</div>}
              </td>
              <td className="px-3 py-2.5">
                <span className={"flex items-start gap-1 " + (r.sucesso ? "text-status-good" : "text-status-critical")}>
                  {r.sucesso ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <XCircle size={13} className="mt-px shrink-0" />}
                  <span>{r.resultado}</span>
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{r.sucesso ? (r.depois ? <Mudanca antes={r.antes?.total} depois={r.depois.total} /> : <span className="text-ink-muted">não consegui ler no SIMO</span>) : <span className="text-ink-muted">{brl(r.antes?.total)}</span>}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{r.sucesso && r.depois ? <Mudanca antes={r.antes?.pago} depois={r.depois.pago} /> : <span className="text-ink-muted">{brl(r.antes?.pago)}</span>}</td>
              <td className="tabular whitespace-nowrap px-3 py-2.5 text-ink-secondary">{brl(r.depois?.medido)}</td>
              {mostrarQuando && <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{r.quando ? new Date(r.quando).toLocaleString("pt-BR") : "-"}</td>}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">Nada por aqui ainda.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const ok = resultados.filter((r) => r.sucesso).length;
  const mudaram = resultados.filter((r) => r.sucesso && r.depois && ((r.antes?.total ?? null) !== r.depois.total || (r.antes?.pago ?? null) !== r.depois.pago)).length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink-primary">Revinculação no SIMO</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Informe os IDs das ações que já estão vinculadas e precisam ser vinculadas de novo para o SIMO atualizar os valores. Para cada ação, o painel refaz o “Vincular Contrato” com o número do contrato no SIAFE (se ele não estiver válido, usa o Número Automático) e, em seguida, lê na página da ação no SIMO os valores novos. Assim você vê o que mudou: valor total e valor pago, antes e depois.
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Cole os IDs aqui (separados por espaço, vírgula ou linha). Ex.: 9836, 13495, 15780"
          className="mt-3 w-full rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm outline-none focus:border-series-1"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={revincular} disabled={rodando || ids.length === 0} className="flex items-center gap-1.5 rounded-full bg-series-1 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <RefreshCw size={13} className={rodando ? "animate-spin" : ""} /> {rodando ? "Revinculando..." : `Revincular ${ids.length} ação(ões)`}
          </button>
          {rodando && (
            <button onClick={() => (parar.current = true)} className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-plane">
              Parar
            </button>
          )}
          {progresso && <span className="tabular text-xs text-ink-muted">{progresso.feitas} de {progresso.total} feitas</span>}
        </div>
        {erro && <p className="mt-2 text-xs font-medium text-status-critical">{erro}</p>}
      </section>

      {resultados.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-black/5 bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">Resultado desta rodada</h2>
              <p className="text-xs text-ink-muted">
                {ok} revinculada(s), {resultados.length - ok} com erro · {mudaram} com valor diferente depois
              </p>
            </div>
            <button onClick={excel} className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white">
              <Download size={13} /> Exportar Excel
            </button>
          </div>
          {tabela(resultados, false)}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-black/5 bg-surface shadow-card">
        <div className="border-b border-black/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-primary">Últimas revinculações</h2>
          <p className="text-xs text-ink-muted">As 50 mais recentes, de todos os usuários. O “antes” vem do relatório do dia; o “depois”, da página da ação no SIMO.</p>
        </div>
        {tabela(historico, true)}
      </section>
    </div>
  );
}

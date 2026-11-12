"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  por?: string | null;
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

type Filtro = "todas" | "mudaram" | "iguais" | "erro";
const POR_PAGINA = 50;
const mudou = (r: LinhaRev) => r.sucesso && !!r.depois && ((r.depois.total != null && (r.antes?.total ?? null) !== r.depois.total) || (r.depois.pago != null && (r.antes?.pago ?? null) !== r.depois.pago));

function csvEscape(v: string) {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function Revinculacao({ historico, erroHistorico }: { historico: LinhaRev[]; erroHistorico?: string | null }) {
  const [texto, setTexto] = useState("");
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<LinhaRev[]>([]);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const parar = useRef(false);
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagina, setPagina] = useState(1);
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const ids = Array.from(new Set((texto.match(/\d+/g) ?? []).filter((i) => i.length <= 12)));

  // Baixa o relatório do SIMO (lento) e atualiza o valor pago e o total dessas ações, no painel e no "depois" da revinculação.
  async function puxarDoRelatorio(lista: string[]) {
    if (lista.length === 0) return;
    setAtualizando(true);
    setAviso("Baixando o relatório do SIMO para trazer o valor pago certo... pode levar alguns minutos, não feche a página.");
    try {
      const resp = await fetch("/api/admin/revincular/atualizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: lista }) });
      const bruto = await resp.text();
      let json: { error?: string; atualizadas?: number; naoEncontradas?: string[] } = {};
      try {
        json = JSON.parse(bruto);
      } catch {
        // não veio JSON
      }
      if (!resp.ok) setAviso(json.error ?? `Não consegui baixar o relatório (HTTP ${resp.status}). Use o botão Puxar valores do relatório mais tarde.`);
      else setAviso(`Valores atualizados pelo relatório do SIMO: ${json.atualizadas ?? 0} ação(ões)${json.naoEncontradas?.length ? `; não vieram no relatório: ${json.naoEncontradas.join(", ")}` : ""}.`);
    } catch {
      setAviso("Sem conexão com o servidor ao baixar o relatório. Use o botão Puxar valores do relatório mais tarde.");
    } finally {
      setAtualizando(false);
      router.refresh();
    }
  }

  async function revincular() {
    if (ids.length === 0) return;
    if (!window.confirm(`Revincular ${ids.length} ação(ões) no SIMO? Isso grava no SIMO (o mesmo que Vincular Contrato → Salvar).`)) return;
    setRodando(true);
    setErro(null);
    setResultados([]);
    parar.current = false;
    let restantes = ids;
    let recebidos = 0;
    const feitasOk: string[] = [];
    setAviso(null);
    setProgresso({ feitas: 0, total: ids.length });
    try {
      while (restantes.length > 0 && !parar.current) {
        const resp = await fetch("/api/admin/revincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: restantes }) });
        const bruto = await resp.text();
        let json: { error?: string; resultados?: LinhaRev[]; restantes?: string[] } = {};
        try {
          json = JSON.parse(bruto);
        } catch {
          // não veio JSON
        }
        if (!resp.ok || !Array.isArray(json.resultados)) {
          setErro(json.error ?? `Resposta inesperada do servidor (HTTP ${resp.status}): ${bruto.replace(/\s+/g, " ").slice(0, 200) || "vazia"}`);
          break;
        }
        const novos = json.resultados ?? [];
        recebidos += novos.length;
        for (const n of novos) if (n.sucesso) feitasOk.push(n.idAcao);
        setResultados((r) => [...r, ...novos]);
        restantes = json.restantes ?? [];
        setProgresso({ feitas: ids.length - restantes.length, total: ids.length });
        if (novos.length === 0 && restantes.length > 0) {
          setErro("O servidor não avançou. Tente de novo com os IDs que faltam.");
          break;
        }
      }
      if (recebidos === 0 && !parar.current) setErro("O servidor respondeu sem nenhum resultado para esses IDs. Recarregue a página (Ctrl+F5) e tente de novo.");
      setPagina(1);
      router.refresh(); // traz o histórico atualizado, já com esta rodada
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setRodando(false);
    }
    // (O download do relatório é lento e fica só no botão "Puxar valores do relatório", se alguém quiser.)
  }

  function excel() {
    const cols = ["ID", "Ação", "Número usado", "Origem do número", "Resultado", "Valor total antes", "Valor total depois", "Valor pago antes", "Valor pago depois", "Medido depois", "Quando", "Por"];
    const n = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
    const linhas = filtradas.map((r) => [r.idAcao, r.nomeAcao, r.numero ?? "", r.origemNumero ?? "", r.resultado, n(r.antes?.total), n(r.depois?.total), n(r.antes?.pago), n(r.depois?.pago), n(r.depois?.medido), r.quando ? new Date(r.quando).toLocaleString("pt-BR") : "", r.por ?? ""].map((x) => csvEscape(String(x))).join(";"));
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
              <td className="whitespace-nowrap px-3 py-2.5">{r.sucesso && r.depois ? r.depois.pago != null ? <Mudanca antes={r.antes?.pago} depois={r.depois.pago} /> : <span className="text-ink-muted">{brl(r.antes?.pago)} <span className="text-[10px]">(valor pago novo: em ajuste)</span></span> : <span className="text-ink-muted">{brl(r.antes?.pago)}</span>}</td>
              <td className="tabular whitespace-nowrap px-3 py-2.5 text-ink-secondary">{brl(r.depois?.medido)}</td>
              {mostrarQuando && <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{r.quando ? new Date(r.quando).toLocaleString("pt-BR") : "-"}{r.por && <div className="text-[10px]">{r.por}</div>}</td>}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">Nenhuma revinculação feita ainda. Cole IDs acima e clique em Revincular: o resultado aparece aqui.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const ok = resultados.filter((r) => r.sucesso).length;
  const mudaram = resultados.filter(mudou).length;

  const filtradas = historico.filter((r) => {
    if (filtro === "mudaram" && !mudou(r)) return false;
    if (filtro === "iguais" && !(r.sucesso && !mudou(r))) return false;
    if (filtro === "erro" && r.sucesso) return false;
    const q = busca.trim().toLowerCase();
    return !q || r.idAcao.includes(q) || r.nomeAcao.toLowerCase().includes(q);
  });
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pagina_ = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

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
        {aviso && <p className="mt-2 text-xs font-medium text-series-1">{aviso}</p>}
      </section>

      {resultados.length > 0 && (
        <p className="rounded-lg border border-black/5 bg-surface px-4 py-2.5 text-xs text-ink-secondary shadow-card">
          <strong>Esta rodada:</strong> {ok} revinculada(s), {resultados.length - ok} com erro · {mudaram} com valor diferente depois. Tudo fica guardado no histórico abaixo.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-black/5 bg-surface shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-black/5 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Histórico de revinculações ({historico.length.toLocaleString("pt-BR")})</h2>
            <p className="text-xs text-ink-muted">Todas as revinculações já feitas, de todos os usuários, nada é apagado. O “antes” vem do relatório do dia; o “depois”, da página da ação no SIMO.</p>
            {erroHistorico && <p className="mt-1 text-xs font-medium text-status-critical">Não consegui ler o histórico: {erroHistorico}. Confira se o SQL 0101 foi rodado.</p>}
          </div>
          <button onClick={() => puxarDoRelatorio(Array.from(new Set(filtradas.filter((r) => r.sucesso).map((r) => r.idAcao))))} disabled={atualizando || rodando || filtradas.length === 0} className="flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-plane disabled:opacity-50" title="Baixa o relatório do SIMO e atualiza o valor pago e o total das ações listadas (usa os filtros atuais)">
            <RefreshCw size={13} className={atualizando ? "animate-spin" : ""} /> Puxar valores do relatório
          </button>
          <button onClick={excel} disabled={filtradas.length === 0} className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            <Download size={13} /> Exportar Excel ({filtradas.length.toLocaleString("pt-BR")})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-4 py-2.5">
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar ID ou nome..."
            className="w-56 rounded-lg border border-black/10 bg-plane px-3 py-1.5 text-xs outline-none focus:border-series-1"
          />
          <select value={filtro} onChange={(e) => { setFiltro(e.target.value as Filtro); setPagina(1); }} className="rounded-lg border border-black/10 bg-plane px-2 py-1.5 text-xs">
            <option value="todas">Todas</option>
            <option value="mudaram">Só as que mudaram de valor</option>
            <option value="iguais">Só as sem mudança</option>
            <option value="erro">Só as com erro</option>
          </select>
          <span className="text-[11px] text-ink-muted">{filtradas.length.toLocaleString("pt-BR")} registro(s)</span>
        </div>
        {tabela(pagina_, true)}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
            <span>Página {paginaAtual} de {totalPaginas}</span>
            <span className="flex gap-2">
              <button disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Anterior</button>
              <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)} className="rounded-full bg-plane px-3 py-1 font-medium disabled:opacity-40">Próxima</button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

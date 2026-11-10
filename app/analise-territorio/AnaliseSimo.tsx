"use client";

import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { normalizarNome, rotuloTerritorio } from "@/lib/territorios";
import { vinculada, type AcaoT } from "@/lib/analiseTerritorio";

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const campo = "rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-secondary focus:border-series-1 focus:outline-none";
const TAMANHO = 50;
const SEM_DADO = "(sem informação no SIMO)";

type Situacao = "Confere" | "Diverge" | "Município não reconhecido" | "Território não informado" | "Sem dados no SIMO";

// Compara o território que o SIMO informou com o território do município que o SIMO informou (tabela de municípios do app).
function situacaoDe(a: AcaoT): Situacao {
  if (!a.simoMunicipio && !a.simoTerritorio) return "Sem dados no SIMO";
  if (a.simoMunicipio && !a.territorioDoMunicipioSimo) return "Município não reconhecido";
  if (!a.simoTerritorio) return "Território não informado";
  const dele = normalizarNome(a.simoTerritorio);
  const nosso = a.territorioDoMunicipioSimo ?? "";
  return dele === normalizarNome(nosso) || dele === normalizarNome(rotuloTerritorio(nosso)) ? "Confere" : "Diverge";
}

const COR: Record<Situacao, string> = {
  Confere: "bg-status-good-bg text-status-good",
  Diverge: "bg-status-critical-bg text-status-critical",
  "Município não reconhecido": "bg-status-warning-bg text-status-warning",
  "Território não informado": "bg-status-warning-bg text-status-warning",
  "Sem dados no SIMO": "bg-black/5 text-ink-muted",
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Análise pelos dados do SIMO (colunas Localização município / território) das ações SEM KML (sem traçado).
// Quando o KML é anexado, a ação sai daqui e passa a ser analisada na visão por KML.
export function AnaliseSimo({ acoes }: { acoes: AcaoT[] }) {
  const semKml = useMemo(() => acoes.filter((a) => a.origem !== "tracado"), [acoes]);
  const [soVinculadas, setSoVinculadas] = useState(true);
  const [busca, setBusca] = useState("");
  const [orgao, setOrgao] = useState("");
  const [territorio, setTerritorio] = useState("");
  const [situacao, setSituacao] = useState("");
  const [pagina, setPagina] = useState(1);

  const base = useMemo(() => (soVinculadas ? semKml.filter(vinculada) : semKml), [semKml, soVinculadas]);
  const orgaos = useMemo(() => Array.from(new Set(base.map((a) => (a.orgao ?? "").trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y, "pt-BR")), [base]);
  const territorios = useMemo(() => Array.from(new Set(base.map((a) => a.simoTerritorio ?? SEM_DADO))).sort((x, y) => x.localeCompare(y, "pt-BR")), [base]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return base.filter((a) => {
      if (orgao && (a.orgao ?? "").trim() !== orgao) return false;
      if (territorio && (a.simoTerritorio ?? SEM_DADO) !== territorio) return false;
      if (situacao && situacaoDe(a) !== situacao) return false;
      if (b && !(a.id.toLowerCase().includes(b) || a.nome.toLowerCase().includes(b) || (a.simoMunicipio ?? "").toLowerCase().includes(b))) return false;
      return true;
    });
  }, [base, busca, orgao, territorio, situacao]);

  const contagem = useMemo(() => {
    const c: Record<Situacao, number> = { Confere: 0, Diverge: 0, "Município não reconhecido": 0, "Território não informado": 0, "Sem dados no SIMO": 0 };
    for (const a of filtradas) c[situacaoDe(a)]++;
    return c;
  }, [filtradas]);

  const porTerritorio = useMemo(() => {
    const m = new Map<string, { acoes: number; vinculadas: number; contratado: number; pago: number }>();
    for (const a of filtradas) {
      const k = a.simoTerritorio ?? SEM_DADO;
      const x = m.get(k) ?? { acoes: 0, vinculadas: 0, contratado: 0, pago: 0 };
      x.acoes++;
      if (vinculada(a)) x.vinculadas++;
      x.contratado += a.original ?? 0;
      x.pago += a.pago ?? 0;
      m.set(k, x);
    }
    return Array.from(m, ([nome, x]) => ({ nome, ...x })).sort((x, y) => y.acoes - x.acoes);
  }, [filtradas]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * TAMANHO, paginaAtual * TAMANHO);

  function exportar() {
    const colunas = ["ID da Ação", "Nome da Ação", "Órgão", "Município SIMO", "Território SIMO", "Território do município (SIMO)", "Situação", "Status", "Vinculação SIAFE", "SIAFE automático", "Valor contratado", "Valor pago total"];
    const linhas = filtradas.map((a) =>
      [a.id, a.nome, a.orgao, a.simoMunicipio, a.simoTerritorio, a.territorioDoMunicipioSimo ? rotuloTerritorio(a.territorioDoMunicipioSimo) : "", situacaoDe(a), a.status, vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número", a.numeroAutomatico, a.original ?? "", a.pago ?? ""]
        .map(csvEscape)
        .join(";")
    );
    const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `analise-simo-sem-kml-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const cartoes = [
    { rotulo: "Ações sem KML", valor: inteiro(filtradas.length), cor: "text-ink-primary" },
    { rotulo: "Confere", valor: inteiro(contagem.Confere), cor: "text-status-good" },
    { rotulo: "Diverge", valor: inteiro(contagem.Diverge), cor: "text-status-critical" },
    { rotulo: "Município não reconhecido", valor: inteiro(contagem["Município não reconhecido"]), cor: "text-status-warning" },
    { rotulo: "Território não informado", valor: inteiro(contagem["Território não informado"]), cor: "text-status-warning" },
    { rotulo: "Sem dados no SIMO", valor: inteiro(contagem["Sem dados no SIMO"]), cor: "text-ink-muted" },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-series-1/30 bg-series-1/5 px-3 py-2 text-xs font-medium text-series-1">
          <Info size={15} className="mt-px shrink-0" />
          <span>
            <strong>Análise pelo SIMO:</strong> só as ações <strong>sem KML anexado</strong>, olhando as colunas Município e Território que vêm do SIMO. Quando o KML é anexado, a ação sai desta lista e passa a ser analisada na visão por KML.
          </span>
        </p>
        <p className="text-xs text-ink-muted">
          &quot;Confere&quot; = o território informado no SIMO é o mesmo do município informado no SIMO. &quot;Diverge&quot; = são diferentes (vale conferir no SIMO).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar ID, nome ou município..." className={campo + " w-64"} />
          <select value={orgao} onChange={(e) => { setOrgao(e.target.value); setPagina(1); }} className={campo}>
            <option value="">Todos os órgãos</option>
            {orgaos.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={territorio} onChange={(e) => { setTerritorio(e.target.value); setPagina(1); }} className={campo}>
            <option value="">Todos os territórios (SIMO)</option>
            {territorios.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1); }} className={campo}>
            <option value="">Qualquer situação</option>
            {(Object.keys(COR) as Situacao[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <input type="checkbox" checked={soVinculadas} onChange={(e) => { setSoVinculadas(e.target.checked); setPagina(1); }} className="h-3.5 w-3.5" />
            só vinculadas ao SIAFE
          </label>
          <button onClick={exportar} disabled={filtradas.length === 0} className="ml-auto flex items-center gap-1.5 rounded-full bg-status-good px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            <Download size={13} /> Exportar Excel
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-xl border border-black/5 bg-surface p-3 shadow-card">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{c.rotulo}</p>
            <p className={"tabular mt-0.5 text-xl font-semibold " + c.cor}>{c.valor}</p>
          </div>
        ))}
      </div>

      <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">Território (SIMO)</th>
              <th className="px-3 py-2.5 text-right">Ações</th>
              <th className="px-3 py-2.5 text-right">Vinculadas</th>
              <th className="px-3 py-2.5 text-right">Valor contratado</th>
              <th className="px-3 py-2.5 text-right">Valor pago</th>
            </tr>
          </thead>
          <tbody>
            {porTerritorio.map((t) => (
              <tr key={t.nome} onClick={() => { setTerritorio(t.nome); setPagina(1); }} className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-plane">
                <td className="px-4 py-2 font-medium text-ink-primary">{t.nome}</td>
                <td className="tabular px-3 py-2 text-right">{inteiro(t.acoes)}</td>
                <td className="tabular px-3 py-2 text-right">{inteiro(t.vinculadas)}</td>
                <td className="tabular px-3 py-2 text-right">{dinheiro(t.contratado)}</td>
                <td className="tabular px-3 py-2 text-right">{dinheiro(t.pago)}</td>
              </tr>
            ))}
            {porTerritorio.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                  Nenhuma ação sem KML com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-black/5 bg-surface shadow-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/5 bg-plane text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">Ação</th>
              <th className="px-3 py-2.5">Órgão</th>
              <th className="px-3 py-2.5">Município SIMO</th>
              <th className="px-3 py-2.5">Território SIMO</th>
              <th className="px-3 py-2.5">Território do município</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5 text-right">Valor contratado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((a) => {
              const s = situacaoDe(a);
              return (
                <tr key={a.id} className="border-b border-black/5 align-top last:border-0">
                  <td className="max-w-md px-4 py-2">
                    <p className="font-medium text-ink-primary">{a.nome}</p>
                    <p className="text-ink-muted">
                      <IdAcaoLink id={a.id} /> · {a.status ?? "-"} · {vinculada(a) ? "Vinculada" : a.numeroSiafe ? "Pendente" : "Sem número"}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{a.orgao ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.simoMunicipio ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.simoTerritorio ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.territorioDoMunicipioSimo ? rotuloTerritorio(a.territorioDoMunicipioSimo) : "-"}</td>
                  <td className="px-3 py-2">
                    <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + COR[s]}>{s}</span>
                  </td>
                  <td className="tabular px-3 py-2 text-right text-ink-secondary">{a.original != null ? dinheiro(a.original) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-black/5 px-4 py-2 text-xs text-ink-muted">
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <span className="flex gap-2">
              <button disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)} className="rounded-full border border-black/10 px-3 py-1 hover:bg-plane disabled:opacity-40">
                Anterior
              </button>
              <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)} className="rounded-full border border-black/10 px-3 py-1 hover:bg-plane disabled:opacity-40">
                Próxima
              </button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

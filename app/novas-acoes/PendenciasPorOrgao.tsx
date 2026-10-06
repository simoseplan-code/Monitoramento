"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { BotaoDownload } from "@/components/BotaoDownload";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";

export type AcaoEncaminhada = {
  idAcao: string;
  nomeAcao: string;
  dataCriacao: string | null;
  kml: Status;
  duplicacao: Status;
  documentos: Status;
  encaminhadaEm: string;
  encaminhadaPor: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
};

export type GrupoOrgao = { orgao: string; acoes: AcaoEncaminhada[] };

const ITENS = [
  { chave: "kml" as const, rotulo: "KML anexado" },
  { chave: "duplicacao" as const, rotulo: "Sem duplicação" },
  { chave: "documentos" as const, rotulo: "Documentos obrigatórios" },
];

export function PendenciasPorOrgao({ grupos, usuarioId, ehAdmin }: { grupos: GrupoOrgao[]; usuarioId: string; ehAdmin: boolean }) {
  const router = useRouter();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [voltando, setVoltando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function alternar(orgao: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(orgao)) novo.delete(orgao);
      else novo.add(orgao);
      return novo;
    });
  }

  async function voltarParaAnalise(idAcao: string) {
    setVoltando(idAcao);
    setErro(null);
    try {
      const resp = await fetch("/api/revisao/encaminhar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [idAcao], acao: "voltar" }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; feitas?: number; ignoradas?: { motivo: string }[] };
      if (!resp.ok) setErro(json.error ?? "Não foi possível devolver para a análise.");
      else if ((json.feitas ?? 0) === 0) setErro(`Não foi possível devolver: ${json.ignoradas?.[0]?.motivo ?? "sem permissão"}.`);
      else router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setVoltando(null);
    }
  }

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
        <p className="text-sm text-ink-muted">Nenhuma ação aguardando solução de pendência.</p>
        <p className="mt-1 text-xs text-ink-muted">Na aba "Em análise", marque as ações com item pendente e use "Encaminhar".</p>
      </div>
    );
  }

  const total = grupos.reduce((t, g) => t + g.acoes.length, 0);
  const todosAbertos = abertos.size === grupos.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {total} ação(ões) em {grupos.length} órgão(s). Só aparecem órgãos com pendência.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAbertos(todosAbertos ? new Set() : new Set(grupos.map((g) => g.orgao)))}
            className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane"
          >
            {todosAbertos ? "Recolher todos" : "Expandir todos"}
          </button>
          <BotaoDownload
            href="/api/relatorios/pendencias"
            rotulo="PDF de todos os órgãos"
            arquivoPadrao="pendencias.pdf"
            className="bg-series-2 text-white hover:opacity-90"
          />
        </div>
      </div>

      {erro && <p className="rounded-lg bg-status-critical-bg px-3 py-2 text-xs text-status-critical">{erro}</p>}

      {grupos.map((g) => {
        const aberto = abertos.has(g.orgao);
        return (
          <section key={g.orgao} className="rounded-xl border border-black/5 bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <button onClick={() => alternar(g.orgao)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={aberto}>
                {aberto ? <ChevronDown size={16} className="shrink-0 text-ink-muted" /> : <ChevronRight size={16} className="shrink-0 text-ink-muted" />}
                <Building2 size={16} className="shrink-0 text-series-1" />
                <span className="truncate text-sm font-semibold text-ink-primary">{g.orgao}</span>
                <span className="shrink-0 rounded-full bg-status-warning-bg px-2.5 py-0.5 text-xs font-semibold text-status-warning">
                  {g.acoes.length} pendência{g.acoes.length > 1 ? "s" : ""}
                </span>
              </button>
              <BotaoDownload
                href={`/api/relatorios/pendencias?orgao=${encodeURIComponent(g.orgao)}`}
                rotulo="PDF deste órgão"
                arquivoPadrao={`pendencias-${g.orgao}.pdf`}
                className="border border-black/10 text-ink-secondary hover:bg-plane"
              />
            </div>

            {aberto && (
              <ul className="divide-y divide-black/5 border-t border-black/5">
                {g.acoes.map((a) => {
                  const pode = ehAdmin || a.responsavelId === usuarioId;
                  return (
                    <li key={a.idAcao} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-primary">{a.nomeAcao}</p>
                          <p className="text-xs text-ink-muted">
                            <IdAcaoLink id={a.idAcao} />
                            {a.dataCriacao ? ` · criada em ${new Date(a.dataCriacao + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} · encaminhada em{" "}
                            {new Date(a.encaminhadaEm).toLocaleDateString("pt-BR")}
                            {a.encaminhadaPor ? ` por ${a.encaminhadaPor}` : ""}
                            {a.responsavelNome ? ` · responsável: ${a.responsavelNome}` : ""}
                          </p>
                        </div>
                        {pode && (
                          <button
                            onClick={() => voltarParaAnalise(a.idAcao)}
                            disabled={voltando === a.idAcao}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-50"
                            title="Devolve a ação para a fila de análise (ex.: o órgão já resolveu)"
                          >
                            <Undo2 size={13} />
                            {voltando === a.idAcao ? "Voltando..." : "Voltar para análise"}
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ITENS.map((i) => {
                          const st = a[i.chave];
                          const cor =
                            st === "aguardando_atualizacao"
                              ? "bg-status-warning-bg text-status-warning"
                              : st === "confirmado"
                                ? "bg-status-good-bg text-status-good opacity-70"
                                : "border border-black/10 text-ink-muted";
                          return (
                            <span key={i.chave} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cor}`}>
                              {st === "aguardando_atualizacao" && <AlertTriangle size={12} strokeWidth={2.5} />}
                              {st === "confirmado" && <Check size={12} strokeWidth={3} />}
                              {i.rotulo}
                              {st === "aguardando_atualizacao" && " — pendente"}
                            </span>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

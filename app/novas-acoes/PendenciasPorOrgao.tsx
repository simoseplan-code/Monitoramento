"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, CheckCheck, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
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
  const [processando, setProcessando] = useState<string | null>(null);
  // Qual confirmação está aberta: "a:ID" (uma ação) ou "g:ÓRGÃO" (o órgão todo).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(orgao: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(orgao)) novo.delete(orgao);
      else novo.add(orgao);
      return novo;
    });
  }

  async function executar(chave: string, ids: string[], acao: "voltar" | "resolver") {
    setProcessando(chave);
    setErro(null);
    setAviso(null);
    try {
      const resp = await fetch("/api/revisao/encaminhar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        error?: string;
        feitas?: number;
        concluidas?: number;
        devolvidas?: number;
        ignoradas?: { id: string; motivo: string }[];
      };
      if (!resp.ok) {
        setErro(json.error ?? "Não foi possível salvar.");
        return;
      }
      const ignoradas = json.ignoradas ?? [];
      const listaIgnoradas = ignoradas.map((x) => x.id + " (" + x.motivo + ")").join("; ");
      if ((json.feitas ?? 0) === 0) {
        setErro("Nada foi alterado" + (ignoradas.length ? ": " + listaIgnoradas : "") + ".");
        return;
      }
      if (acao === "resolver") {
        setAviso(
          (json.concluidas ?? 0) + " ação(ões) concluída(s)." +
            ((json.devolvidas ?? 0) > 0 ? " " + json.devolvidas + " voltou(aram) para a análise porque ainda têm item não analisado." : "") +
            (ignoradas.length ? " Não alteradas: " + listaIgnoradas + "." : "")
        );
      } else if (ignoradas.length) {
        setErro("Não devolvidas: " + listaIgnoradas + ".");
      }
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setProcessando(null);
      setConfirmando(null);
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
      {aviso && <p className="rounded-lg bg-status-good-bg px-3 py-2 text-xs text-status-good">{aviso}</p>}

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
              <div className="flex flex-wrap items-center gap-2">
              {confirmando === `g:${g.orgao}` ? (
                <span className="flex items-center gap-1.5 rounded-full bg-status-good-bg px-2 py-1 text-xs font-medium text-status-good">
                  {g.orgao} resolveu todas as {g.acoes.length} pendência(s)? As ações serão concluídas.
                  <button
                    onClick={() => executar(`g:${g.orgao}`, g.acoes.map((a) => a.idAcao), "resolver")}
                    disabled={processando !== null}
                    className="rounded-full bg-status-good px-2 py-0.5 text-white disabled:opacity-50"
                  >
                    {processando === `g:${g.orgao}` ? "..." : "Sim"}
                  </button>
                  <button onClick={() => setConfirmando(null)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
                    Não
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmando(`g:${g.orgao}`)}
                  disabled={processando !== null}
                  className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  title="Marca os itens pendentes como resolvidos e conclui a análise de todas as ações deste órgão"
                >
                  <CheckCheck size={13} />
                  Órgão resolveu tudo
                </button>
              )}
              <BotaoDownload
                href={`/api/relatorios/pendencias?orgao=${encodeURIComponent(g.orgao)}`}
                rotulo="PDF deste órgão"
                arquivoPadrao={`pendencias-${g.orgao}.pdf`}
                className="border border-black/10 text-ink-secondary hover:bg-plane"
              />
              </div>
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
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {confirmando === `a:${a.idAcao}` ? (
                              <span className="flex items-center gap-1.5 rounded-full bg-status-good-bg px-2 py-1 text-xs font-medium text-status-good">
                                Órgão resolveu? A ação será concluída.
                                <button
                                  onClick={() => executar(`a:${a.idAcao}`, [a.idAcao], "resolver")}
                                  disabled={processando !== null}
                                  className="rounded-full bg-status-good px-2 py-0.5 text-white disabled:opacity-50"
                                >
                                  {processando === `a:${a.idAcao}` ? "..." : "Sim"}
                                </button>
                                <button onClick={() => setConfirmando(null)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
                                  Não
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmando(`a:${a.idAcao}`)}
                                disabled={processando !== null}
                                className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                title="Marca os itens pendentes como resolvidos e conclui a análise"
                              >
                                <CheckCheck size={13} />
                                Órgão resolveu
                              </button>
                            )}
                            <button
                              onClick={() => executar(`v:${a.idAcao}`, [a.idAcao], "voltar")}
                              disabled={processando !== null}
                              className="flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-50"
                              title="Devolve a ação para a fila de análise sem concluir"
                            >
                              <Undo2 size={13} />
                              {processando === `v:${a.idAcao}` ? "Voltando..." : "Voltar para análise"}
                            </button>
                          </div>
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

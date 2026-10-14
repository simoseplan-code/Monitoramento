"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { IdAcaoLink } from "@/components/IdAcaoLink";

export type AcaoInfo = { nome: string; orgao: string | null; status: string | null; estagio: string | null };
export type Mae = { id: string; filhas: string[] };

type Acao = "adicionar_mae" | "adicionar_filha" | "remover_mae" | "remover_filha";

async function chamar(acao: Acao, id: string, idMae?: string): Promise<string | null> {
  try {
    const resp = await fetch("/api/td", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, id, idMae }),
    });
    if (resp.ok) return null;
    return ((await resp.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível concluir.";
  } catch {
    return "Sem conexão com o servidor.";
  }
}

function CampoId({ rotulo, botao, aoAdicionar }: { rotulo: string; botao: string; aoAdicionar: (id: string) => Promise<string | null> }) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const id = valor.trim();
    if (!id) return;
    setSalvando(true);
    setErro(null);
    const falha = await aoAdicionar(id);
    setSalvando(false);
    if (falha) setErro(falha);
    else setValor("");
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder={rotulo}
          className="w-52 rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none"
        />
        <button
          type="submit"
          disabled={salvando || !valor.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-series-1 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={14} /> {salvando ? "Adicionando..." : botao}
        </button>
      </div>
      {erro && <span className="text-xs text-status-critical">{erro}</span>}
    </form>
  );
}

function LinhaAcao({ id, info, aoRemover }: { id: string; info?: AcaoInfo; aoRemover: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-primary" title={info?.nome}>
          <IdAcaoLink id={id} /> <span className="text-ink-muted">·</span> {info?.nome ?? "Ação não encontrada na base (pode ter saído do SIMO)"}
        </p>
        {info && (
          <p className="truncate text-xs text-ink-muted">
            {[info.orgao, info.estagio, info.status].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <button onClick={aoRemover} title="Remover" className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-status-critical/10 hover:text-status-critical">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function ConfiguracaoTd({ maes, info }: { maes: Mae[]; info: Record<string, AcaoInfo> }) {
  const router = useRouter();
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    const novas = new Set(abertas);
    if (novas.has(id)) novas.delete(id);
    else novas.add(id);
    setAbertas(novas);
  }

  async function executar(acao: Acao, id: string, idMae?: string): Promise<string | null> {
    const falha = await chamar(acao, id, idMae);
    if (falha) return falha;
    router.refresh();
    return null;
  }

  async function remover(acao: "remover_mae" | "remover_filha", id: string, aviso: string) {
    if (!window.confirm(aviso)) return;
    setErro(null);
    const falha = await executar(acao, id);
    if (falha) setErro(falha);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Nova ação mãe</h2>
        <p className="mb-3 text-xs text-ink-muted">Digite o ID da ação que vai ser a mãe. Depois, abra a seta dela para adicionar as ações filhas.</p>
        <CampoId rotulo="ID da ação mãe" botao="Adicionar mãe" aoAdicionar={(id) => executar("adicionar_mae", id)} />
      </section>

      {erro && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erro}</p>}

      {maes.length === 0 ? (
        <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
          <p className="text-sm text-ink-muted">Nenhuma ação mãe configurada ainda. Adicione a primeira acima.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {maes.map((m) => {
            const aberta = abertas.has(m.id);
            return (
              <section key={m.id} className="rounded-xl border border-black/5 bg-surface shadow-card">
                <div className="flex items-start gap-2 p-4">
                  <button
                    onClick={() => alternar(m.id)}
                    aria-expanded={aberta}
                    title={aberta ? "Recolher ações filhas" : "Mostrar ações filhas"}
                    className="mt-0.5 shrink-0 rounded-lg p-1 text-ink-secondary hover:bg-plane"
                  >
                    {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <LinhaAcao
                    id={m.id}
                    info={info[m.id]}
                    aoRemover={() =>
                      remover(
                        "remover_mae",
                        m.id,
                        m.filhas.length > 0
                          ? `Remover a ação mãe ${m.id}? As ${m.filhas.length} ação(ões) filha(s) dela também saem da configuração (as ações em si não são apagadas).`
                          : `Remover a ação mãe ${m.id}?`
                      )
                    }
                  />
                  <span className="mt-1 shrink-0 rounded-full bg-series-1/10 px-2.5 py-0.5 text-xs font-semibold text-series-1">
                    {m.filhas.length} filha(s)
                  </span>
                </div>

                {aberta && (
                  <div className="space-y-3 border-t border-black/5 py-4 pl-12 pr-4">
                    {m.filhas.length === 0 && <p className="text-xs text-ink-muted">Nenhuma ação filha ainda.</p>}
                    {m.filhas.map((f) => (
                      <div key={f} className="flex items-start gap-2 border-l-2 border-series-1/30 pl-3">
                        <LinhaAcao
                          id={f}
                          info={info[f]}
                          aoRemover={() => remover("remover_filha", f, `Tirar a ação ${f} de dentro da mãe ${m.id}?`)}
                        />
                      </div>
                    ))}
                    <CampoId rotulo="ID da ação filha" botao="Adicionar filha" aoAdicionar={(id) => executar("adicionar_filha", id, m.id)} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

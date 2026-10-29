"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { lerIds } from "@/lib/acoesFiltro";

// Lista de IDs que a equipe toda decidiu DESCONSIDERAR de uma análise (uma lista por tela).
// A lista fica no banco (tabela acoes_desconsideradas): vale para todas as pessoas.

export type Desconsiderada = { id: string; em: string; por: string | null };
export type TelaDesconsideradas = "nao_vinculadas" | "concluidas";

const inteiro = (v: number) => v.toLocaleString("pt-BR");

export function useDesconsideradas(tela: TelaDesconsideradas, inicial: Desconsiderada[], aoMudar?: () => void) {
  const [desc, setDesc] = useState<Desconsiderada[]>(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const idsDesc = useMemo(() => desc.map((d) => d.id).join(" "), [desc]);

  async function mudar(acao: "adicionar" | "devolver" | "devolver_todos", ids: string[] = []): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/acoes-desconsideradas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tela, acao, ids }) });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; lista?: Desconsiderada[] };
      if (!resp.ok) {
        setErro(json.error ?? "Não foi possível salvar.");
        return false;
      }
      setDesc(json.lista ?? []);
      aoMudar?.();
      return true;
    } catch {
      setErro("Sem conexão com o servidor.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return { desc, ocupado, erro, mudar, idsDesc };
}

export function DesconsiderarIds({
  lista,
  ocupado,
  erro,
  aoAdicionar,
  aoDevolver,
  aoDevolverTodos,
}: {
  lista: Desconsiderada[];
  ocupado: boolean;
  erro: string | null;
  aoAdicionar: (ids: string[]) => Promise<boolean>;
  aoDevolver: (ids: string[]) => Promise<boolean>;
  aoDevolverTodos: () => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [verLista, setVerLista] = useState(false);
  const novos = lerIds(texto);
  const jaNaLista = new Set(lista.map((d) => d.id));
  const aAdicionar = novos.filter((i) => !jaNaLista.has(i));

  return (
    <div className="space-y-1.5 border-b border-black/5 px-4 py-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        IDs para desconsiderar (equipe toda)
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Cole os IDs que devem sair da análise (vírgula, espaço ou linha)"
          className="mt-1 w-full rounded-lg border border-black/10 bg-plane px-2 py-1.5 font-mono text-xs font-normal normal-case text-ink-primary focus:outline-none"
        />
      </label>
      <button
        onClick={async () => {
          if (await aoAdicionar(aAdicionar)) setTexto("");
        }}
        disabled={ocupado || aAdicionar.length === 0}
        className="w-full rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {ocupado ? "Salvando..." : aAdicionar.length > 0 ? `Desconsiderar ${inteiro(aAdicionar.length)} ID(s)` : "Desconsiderar"}
      </button>
      {novos.length > 0 && aAdicionar.length < novos.length && (
        <p className="text-[11px] text-ink-muted">{inteiro(novos.length - aAdicionar.length)} já estava(m) na lista.</p>
      )}
      <div className="flex items-center justify-between text-[11px]">
        <button onClick={() => setVerLista((v) => !v)} className="font-medium text-series-1 hover:underline">
          {lista.length > 0 ? `${verLista ? "Esconder" : "Ver"} os ${inteiro(lista.length)} desconsiderado(s)` : "Nenhum ID desconsiderado"}
        </button>
        {lista.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm(`Devolver todos os ${lista.length} IDs para a análise? Isso vale para a equipe toda.`)) void aoDevolverTodos();
            }}
            disabled={ocupado}
            className="font-medium text-ink-muted hover:text-ink-primary hover:underline disabled:opacity-50"
          >
            Devolver todos
          </button>
        )}
      </div>
      {verLista && lista.length > 0 && (
        <ul className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {lista.map((d) => (
            <li key={d.id} className="flex items-center gap-1 rounded-full bg-plane px-2 py-0.5 text-[11px] text-ink-secondary" title={`${d.por ? "Por " + d.por + ", " : ""}${new Date(d.em).toLocaleDateString("pt-BR")}`}>
              {d.id}
              <button onClick={() => void aoDevolver([d.id])} disabled={ocupado} aria-label={`Devolver ${d.id} para a análise`} className="text-ink-muted hover:text-status-critical disabled:opacity-50">
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="text-[11px] font-medium text-status-critical">{erro}</p>}
      <p className="text-[11px] leading-snug text-ink-muted">A lista vale para todas as pessoas: some da lista, do PDF e do Excel de todo mundo, até alguém devolver.</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Lock, UserRound } from "lucide-react";
import { ChecklistItem } from "@/app/novas-acoes/ChecklistItem";
import { ComentarioPendencia } from "@/app/novas-acoes/ComentarioPendencia";
import { ConcluirBotao } from "@/app/novas-acoes/ConcluirBotao";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { AnalisarKmlBotao } from "@/components/AnalisarKml";
import { ITENS_EXECUCAO, type StatusItem } from "@/lib/execucao";

export type PessoaExec = { id: string; nome: string };
type Pessoa = PessoaExec;

export function CardNovaExecucao({
  idAcao,
  nomeAcao,
  orgao,
  virouEm,
  estagioAnterior,
  itensInicial,
  obsInicial,
  concluido,
  kmlGuardado = false,
  responsavelInicial,
  usuario,
  ehAdmin,
  equipe,
  selecionada = false,
  onSelecionar,
  onPendencia,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  virouEm: string;
  estagioAnterior: string | null;
  itensInicial: Record<string, string>;
  obsInicial: Record<string, string>;
  concluido: boolean;
  kmlGuardado?: boolean;
  responsavelInicial: Pessoa | null;
  usuario: Pessoa;
  ehAdmin: boolean;
  equipe: Pessoa[];
  selecionada?: boolean;
  onSelecionar?: (idAcao: string, marcada: boolean) => void;
  onPendencia?: (idAcao: string, temPendencia: boolean) => void;
}) {
  const [itens, setItens] = useState<Record<string, StatusItem>>(
    Object.fromEntries(ITENS_EXECUCAO.map((i) => [i.campo, (itensInicial[i.campo] as StatusItem) ?? "pendente"]))
  );
  const [obs, setObs] = useState<Record<string, string>>(obsInicial);
  const [recemPendente, setRecemPendente] = useState<Set<string>>(new Set());
  const [responsavel, setResponsavel] = useState<Pessoa | null>(responsavelInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);

  const tudoConfirmado = ITENS_EXECUCAO.every((i) => itens[i.campo] === "confirmado");
  const bloqueado = !!responsavel && responsavel.id !== usuario.id && !ehAdmin;
  const pendentes = ITENS_EXECUCAO.filter((i) => itens[i.campo] === "aguardando_atualizacao");

  // Só dá para marcar (e encaminhar ao órgão) ação com algum item pendente.
  const temPendencia = pendentes.length > 0 && !concluido;
  useEffect(() => {
    onPendencia?.(idAcao, temPendencia);
    if (!temPendencia && selecionada) onSelecionar?.(idAcao, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temPendencia]);

  function aoSalvarResponsavel(id: string) {
    if (responsavel?.id === id) return;
    if (id === usuario.id) setResponsavel(usuario);
    else setResponsavel(equipe.find((p) => p.id === id) ?? { id, nome: "Outra pessoa" });
  }

  async function trocarResponsavel(usuarioId: string) {
    if (!usuarioId || usuarioId === responsavel?.id) return;
    setTrocando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/revisao/responsavel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, usuarioId, modulo: "execucao" }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; responsavelId?: string; responsavelNome?: string };
      if (!resp.ok) setErro(json.error ?? "Não foi possível trocar o responsável.");
      else setResponsavel({ id: json.responsavelId!, nome: json.responsavelNome ?? "-" });
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setTrocando(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 shadow-card transition-colors ${
        concluido ? "border-status-good/20 bg-status-good-bg" : "border-black/5 bg-surface"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            <IdAcaoLink id={idAcao} /> · {orgao ?? "Sem órgão"} · virou EM EXECUÇÃO em {new Date(virouEm + "T00:00:00").toLocaleDateString("pt-BR")}
            {estagioAnterior ? ` (estava em ${estagioAnterior})` : " (ação nova)"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <AnalisarKmlBotao idAcao={idAcao} nomeAcao={nomeAcao} kmlGuardado={kmlGuardado} />
          {!bloqueado && (tudoConfirmado || concluido) && <ConcluirBotao idAcao={idAcao} concluido={concluido} endpoint="/api/execucao/concluir" />}
          {temPendencia && onSelecionar && (
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selecionada ? "border-status-warning bg-status-warning-bg text-status-warning" : "border-black/10 text-ink-muted hover:bg-plane"
              } ${bloqueado ? "cursor-not-allowed opacity-50" : ""}`}
              title={
                bloqueado
                  ? "Só o responsável pela análise ou um administrador pode encaminhar"
                  : "Marcar para encaminhar ao órgão (aguardando solução de pendência)"
              }
            >
              <input
                type="checkbox"
                checked={selecionada}
                disabled={bloqueado}
                onChange={(e) => onSelecionar(idAcao, e.target.checked)}
                className="h-3.5 w-3.5 accent-status-warning"
              />
              Marcar
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ITENS_EXECUCAO.map((i) => (
          <ChecklistItem
            key={i.campo}
            idAcao={idAcao}
            campo={i.campo}
            label={i.label}
            status={itens[i.campo]}
            bloqueado={bloqueado}
            endpoint="/api/execucao/check"
            onSalvo={(novo) => {
              setErro(null);
              setItens((s) => ({ ...s, [i.campo]: novo }));
              if (novo === "aguardando_atualizacao") setRecemPendente((r) => new Set(r).add(i.campo));
              else {
                setObs((o) => ({ ...o, [i.campo]: "" }));
                setRecemPendente((r) => {
                  const n = new Set(r);
                  n.delete(i.campo);
                  return n;
                });
              }
            }}
            onErro={setErro}
            onResponsavel={aoSalvarResponsavel}
          />
        ))}
      </div>

      {!concluido && pendentes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {pendentes.map((i) => (
            <ComentarioPendencia
              key={i.campo}
              idAcao={idAcao}
              campo={i.campo}
              label={i.label}
              valor={obs[i.campo] ?? ""}
              abrirAgora={recemPendente.has(i.campo)}
              bloqueado={bloqueado}
              endpoint="/api/execucao/check"
              onSalvo={(texto) => setObs((o) => ({ ...o, [i.campo]: texto }))}
              onErro={setErro}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          {bloqueado ? <Lock size={12} /> : <UserRound size={12} />}
          {responsavel ? (
            <>
              Responsável: <span className="font-medium text-ink-secondary">{responsavel.nome}</span>
              {responsavel.id === usuario.id && " (você)"}
            </>
          ) : (
            "Sem responsável, quem marcar o primeiro item assume a análise"
          )}
        </span>

        {ehAdmin && (
          <label className="flex items-center gap-1.5 text-ink-muted">
            Alterar responsável
            <select
              value={responsavel?.id ?? ""}
              disabled={trocando}
              onChange={(e) => trocarResponsavel(e.target.value)}
              className="rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-secondary focus:border-series-1 focus:outline-none disabled:opacity-50"
            >
              {!responsavel && <option value="">Escolher</option>}
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {erro && <p className="mt-2 rounded-lg bg-status-critical-bg px-3 py-1.5 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}

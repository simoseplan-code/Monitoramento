"use client";

import { useState } from "react";
import { Lock, UserRound } from "lucide-react";
import { ChecklistItem } from "./ChecklistItem";
import { ConcluirBotao } from "./ConcluirBotao";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";

const CHECKS = [
  { campo: "kml_anexado" as const, label: "KML anexado" },
  { campo: "sem_duplicacao" as const, label: "Sem duplicação" },
  { campo: "documentos_obrigatorios" as const, label: "Documentos obrigatórios inseridos" },
];

export type PessoaEquipe = { id: string; nome: string };

export function CardNovaAcao({
  idAcao,
  nomeAcao,
  orgao,
  dataCriacao,
  statusInicial,
  concluido,
  responsavelInicial,
  usuario,
  ehAdmin,
  equipe,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  dataCriacao: string;
  statusInicial: {
    kml_anexado: Status;
    sem_duplicacao: Status;
    documentos_obrigatorios: Status;
  };
  concluido: boolean;
  responsavelInicial: PessoaEquipe | null;
  usuario: PessoaEquipe;
  ehAdmin: boolean;
  equipe: PessoaEquipe[];
}) {
  // Estado local pros checks — clicar num item atualiza só este
  // card na hora, sem pedir pro Next.js re-renderizar a página inteira
  // (que numa lista de dezenas de ações ficava perceptivelmente lento).
  const [status, setStatus] = useState(statusInicial);
  const [responsavel, setResponsavel] = useState<PessoaEquipe | null>(responsavelInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);

  const tudoConfirmado = CHECKS.every((c) => status[c.campo] === "confirmado");
  // Com responsável que não é você, só leitura (admin pode tudo).
  const bloqueado = !!responsavel && responsavel.id !== usuario.id && !ehAdmin;

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
        body: JSON.stringify({ idAcao, usuarioId }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; responsavelId?: string; responsavelNome?: string };
      if (!resp.ok) setErro(json.error ?? "Não foi possível trocar o responsável.");
      else setResponsavel({ id: json.responsavelId!, nome: json.responsavelNome ?? "—" });
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
            <IdAcaoLink id={idAcao} /> · {orgao ?? "Sem órgão"} · criada em{" "}
            {dataCriacao ? new Date(dataCriacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
        {!bloqueado && (tudoConfirmado || concluido) && <ConcluirBotao idAcao={idAcao} concluido={concluido} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {CHECKS.map((c) => (
          <ChecklistItem
            key={c.campo}
            idAcao={idAcao}
            campo={c.campo}
            label={c.label}
            status={status[c.campo]}
            bloqueado={bloqueado}
            onSalvo={(novoStatus) => {
              setErro(null);
              setStatus((s) => ({ ...s, [c.campo]: novoStatus }));
            }}
            onErro={setErro}
            onResponsavel={aoSalvarResponsavel}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          {bloqueado ? <Lock size={12} /> : <UserRound size={12} />}
          {responsavel ? (
            <>
              Responsável: <span className="font-medium text-ink-secondary">{responsavel.nome}</span>
              {responsavel.id === usuario.id && " (você)"}
            </>
          ) : (
            "Sem responsável — quem marcar o primeiro item assume a análise"
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
              {!responsavel && <option value="">— escolher —</option>}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import type { PessoaEquipe } from "./CardNovaAcao";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";

const ITENS = [
  { campo: "kml_anexado" as const, label: "KML anexado" },
  { campo: "sem_duplicacao" as const, label: "Sem duplicação" },
  { campo: "documentos_obrigatorios" as const, label: "Documentos obrigatórios" },
];

export function CardAcaoExcluida({
  idAcao,
  nomeAcao,
  orgao,
  dataCriacao,
  excluidaEm,
  status,
  responsavel,
  podeDarBaixa,
}: {
  idAcao: string;
  nomeAcao: string | null;
  orgao: string | null;
  dataCriacao: string | null;
  excluidaEm: string;
  status: Record<(typeof ITENS)[number]["campo"], Status>;
  responsavel: PessoaEquipe | null;
  podeDarBaixa: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function darBaixa() {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/revisao/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) setErro(json.error ?? "Não foi possível dar baixa.");
      else router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="rounded-xl border border-status-critical/20 bg-status-critical-bg p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-critical px-2 py-0.5 text-[11px] font-semibold text-white">
              <Trash2 size={11} /> Ação excluída do SIMO
            </span>
            <span className="truncate">{nomeAcao ?? "Nome não guardado (a ação sumiu antes do registro)"}</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            ID {idAcao} · {orgao ?? "Sem órgão"}
            {dataCriacao ? ` · criada em ${new Date(dataCriacao + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} · sumiu do SIMO em{" "}
            {new Date(excluidaEm).toLocaleDateString("pt-BR")}
          </p>
        </div>

        {podeDarBaixa &&
          (confirmando ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-status-critical">
              Dar baixa? Sai desta lista.
              <button onClick={darBaixa} disabled={salvando} className="rounded-full bg-status-critical px-2 py-0.5 text-white disabled:opacity-50">
                {salvando ? "..." : "Sim"}
              </button>
              <button onClick={() => setConfirmando(false)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
                Não
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-white"
            >
              Dar baixa
            </button>
          ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {ITENS.map((i) => {
          const st = status[i.campo];
          const cor =
            st === "confirmado"
              ? "bg-status-good-bg text-status-good"
              : st === "aguardando_atualizacao"
                ? "bg-status-warning-bg text-status-warning"
                : "border border-black/10 bg-white/60 text-ink-secondary";
          return (
            <span key={i.campo} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cor}`}>
              {st === "confirmado" && <Check size={12} strokeWidth={3} />}
              {st === "aguardando_atualizacao" && <AlertTriangle size={12} strokeWidth={2.5} />}
              {i.label}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Responsável: <span className="font-medium text-ink-secondary">{responsavel?.nome ?? "—"}</span> · análise ficou pendente e a ação
        não existe mais no SIMO.
      </p>
      {erro && <p className="mt-2 rounded-lg bg-white/70 px-3 py-1.5 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}

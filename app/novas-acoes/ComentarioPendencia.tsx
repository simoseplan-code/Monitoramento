"use client";

import { useState } from "react";
import { MessageSquarePlus, Pencil } from "lucide-react";

type Campo = string;

// Comentário curto de um item marcado como pendente ("o que aconteceu"). Aparece na aba de
// pendências e no PDF do órgão. Itens já confirmados não têm comentário.
export function ComentarioPendencia({
  idAcao,
  campo,
  label,
  valor,
  abrirAgora,
  bloqueado,
  onSalvo,
  onErro,
  endpoint = "/api/revisao/check",
}: {
  idAcao: string;
  campo: Campo;
  label: string;
  valor: string;
  abrirAgora: boolean;
  bloqueado: boolean;
  onSalvo: (texto: string) => void;
  onErro: (mensagem: string) => void;
  endpoint?: string;
}) {
  const [editando, setEditando] = useState(abrirAgora);
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, campo, status: "aguardando_atualizacao", comentario: texto }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; comentario?: string | null };
      if (!resp.ok) {
        onErro(json.error ?? "Não foi possível salvar o comentário.");
        return;
      }
      onSalvo(json.comentario ?? "");
      setTexto(json.comentario ?? "");
      setEditando(false);
    } catch {
      onErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  if (editando && !bloqueado) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-status-warning">{label}:</span>
        <input
          autoFocus
          value={texto}
          maxLength={300}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              setTexto(valor);
              setEditando(false);
            }
          }}
          placeholder="O que aconteceu? (aparece no PDF da pendência)"
          className="min-w-[16rem] flex-1 rounded-lg border border-black/10 bg-plane px-2.5 py-1.5 text-xs text-ink-primary focus:border-series-1 focus:outline-none"
        />
        <button onClick={salvar} disabled={salvando} className="rounded-lg bg-series-1 px-2.5 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          onClick={() => {
            setTexto(valor);
            setEditando(false);
          }}
          className="text-ink-muted hover:text-ink-primary"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (valor) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
        <span className="font-medium text-status-warning">{label}:</span> {valor}
        {!bloqueado && (
          <button onClick={() => setEditando(true)} title="Editar comentário" className="text-ink-muted hover:text-series-1">
            <Pencil size={12} />
          </button>
        )}
      </p>
    );
  }

  if (bloqueado) return null;
  return (
    <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-series-1">
      <MessageSquarePlus size={13} /> Comentário sobre {label.toLowerCase()}
    </button>
  );
}

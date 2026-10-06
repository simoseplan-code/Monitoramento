"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AprovarBotoes({ userId }: { userId: string }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [papel, setPapel] = useState("equipe");
  const [erro, setErro] = useState<string | null>(null);

  async function agir(acao: "aprovar" | "rejeitar") {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, acao, papel }),
      });
      if (!resp.ok) {
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        setErro(json.error ?? "Não foi possível concluir.");
        return;
      }
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Entra como
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            disabled={carregando}
            className="rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-secondary focus:border-series-1 focus:outline-none"
          >
            <option value="equipe">Equipe</option>
            <option value="chefe">Chefe</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button
          disabled={carregando}
          onClick={() => agir("aprovar")}
          className="rounded-lg bg-status-good px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Aprovar
        </button>
        <button
          disabled={carregando}
          onClick={() => agir("rejeitar")}
          className="rounded-lg bg-status-critical px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Rejeitar
        </button>
      </div>
      {erro && <span className="text-[11px] text-status-critical">{erro}</span>}
    </div>
  );
}

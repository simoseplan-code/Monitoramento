"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export const ROTULO_PAPEL: Record<string, string> = { admin: "Administrador", chefe: "Chefe", equipe: "Equipe" };

// Troca a função de uma pessoa já aprovada. Só aparece para administrador.
export function PapelSelect({ userId, papelAtual }: { userId: string; papelAtual: string }) {
  const router = useRouter();
  const [papel, setPapel] = useState(papelAtual);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocar(novo: string) {
    if (novo === papel) return;
    if (!window.confirm(`Mudar a função desta pessoa para "${ROTULO_PAPEL[novo]}"?`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/papel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, papel: novo }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) setErro(json.error ?? "Não foi possível alterar.");
      else {
        setPapel(novo);
        router.refresh();
      }
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <select
        value={papel}
        disabled={salvando}
        onChange={(e) => trocar(e.target.value)}
        className="rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-secondary focus:border-series-1 focus:outline-none disabled:opacity-50"
      >
        <option value="admin">Administrador</option>
        <option value="chefe">Chefe</option>
        <option value="equipe">Equipe</option>
      </select>
      {erro && <span className="text-[11px] text-status-critical">{erro}</span>}
    </span>
  );
}

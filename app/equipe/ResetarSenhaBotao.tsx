"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

// Reseta a senha de alguém da equipe. Só aparece para administrador.
export function ResetarSenhaBotao({ userId, nome }: { userId: string; nome: string }) {
  const [carregando, setCarregando] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function resetar() {
    if (!window.confirm(`Resetar a senha de ${nome}? A senha atual deixa de funcionar na hora.`)) return;
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/resetar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; senha?: string };
      if (!resp.ok || !json.senha) setErro(json.error ?? "Não foi possível resetar.");
      else setSenha(json.senha);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  async function copiar() {
    if (!senha) return;
    try {
      await navigator.clipboard.writeText(senha);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  if (senha) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-2">
          <code className="rounded bg-plane px-2 py-0.5 font-mono text-xs text-ink-primary">{senha}</code>
          <button onClick={copiar} className="text-xs font-semibold text-series-1 hover:underline">
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </span>
        <span className="text-[11px] text-ink-muted">Senha provisória. Ela aparece só agora; no próximo acesso a pessoa cria a nova.</span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={resetar}
        disabled={carregando}
        className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs text-ink-secondary transition-colors hover:bg-plane disabled:opacity-50"
      >
        <KeyRound size={12} /> {carregando ? "Resetando..." : "Resetar senha"}
      </button>
      {erro && <span className="text-[11px] text-status-critical">{erro}</span>}
    </span>
  );
}

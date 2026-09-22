"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AplicarUnidadeBotao({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function aplicar() {
    setConfirmando(false);
    setCarregando(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/admin/aplicar-unidade", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) {
        setMsg(`❌ ${data.error}`);
      } else {
        setMsg(
          `✅ ${data.sucesso} gravada(s), ${data.falha} a verificar` +
            (data.restantes > 0 ? ` — ${data.restantes} restante(s), rode de novo pra continuar.` : ".")
        );
      }
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  if (pendentes === 0 && !msg) {
    return <span className="text-xs text-ink-muted">Nenhuma sugestão aprovada aguardando gravação.</span>;
  }

  if (confirmando) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-secondary">Gravar {pendentes} alteração(ões) no SIMO agora? Isso grava dado real.</span>
        <button onClick={aplicar} className="rounded-lg bg-status-warning px-3 py-1.5 font-semibold text-white hover:opacity-90">
          Sim, gravar
        </button>
        <button onClick={() => setConfirmando(false)} className="rounded-lg px-2 py-1.5 text-ink-muted hover:text-ink-primary">
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      <button
        disabled={carregando}
        onClick={() => setConfirmando(true)}
        className="rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {carregando ? "Gravando..." : `Aplicar ${pendentes} sugestão(ões) aprovada(s) no SIMO`}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

// Baixa por fetch (e não por link) para mostrar o motivo quando o servidor falha,
// em vez de salvar um arquivo .json de erro.
export function BotaoDownload({
  href,
  rotulo,
  arquivoPadrao,
  className = "",
}: {
  href: string;
  rotulo: string;
  arquivoPadrao: string;
  className?: string;
}) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setGerando(true);
    setErro(null);
    try {
      const resp = await fetch(href, { credentials: "same-origin" });
      if (!resp.ok || (resp.headers.get("Content-Type") ?? "").includes("application/json")) {
        let msg = `Erro ${resp.status}`;
        try {
          const json = await resp.json();
          if (json?.error) msg = `${json.error} (erro ${resp.status})`;
        } catch {
          /* mantém a mensagem padrão */
        }
        setErro(msg);
        return;
      }
      const cab = resp.headers.get("Content-Disposition") ?? "";
      const nome = cab.match(/filename="?([^";]+)"?/i)?.[1] ?? arquivoPadrao;
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={baixar}
        disabled={gerando}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${className}`}
      >
        {gerando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
        {gerando ? "Gerando..." : rotulo}
      </button>
      {erro && <span className="max-w-xs text-right text-[11px] text-status-critical">{erro}</span>}
    </span>
  );
}

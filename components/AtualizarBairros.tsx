"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

const inteiro = (v: number) => v.toLocaleString("pt-BR");

// Roda o cálculo da Verificação de bairros (bairros, zona e território de cada ação) em lotes curtos:
// cada chamada trabalha uns 40 s e o botão chama de novo até acabar. Só admin e chefe (o servidor confere).
export function AtualizarBairros({ ehAdmin }: { ehAdmin: boolean }) {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function atualizar(refazer = false) {
    setAtualizando(true);
    setMsg(null);
    let total = 0;
    try {
      for (let rodada = 0; rodada < 60; rodada++) {
        const resp = await fetch("/api/bairros/atualizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baixarMapa: rodada === 0, refazerTudo: refazer && rodada === 0 }),
        });
        const texto = await resp.text();
        let json: { error?: string; processadas?: number; terminou?: boolean } = {};
        try {
          json = JSON.parse(texto);
        } catch {
          // resposta que não é do nosso código (ex.: tempo esgotado na hospedagem)
        }
        if (!resp.ok) {
          setMsg({ tipo: "erro", texto: (json.error ?? `O servidor respondeu ${resp.status}.`) + (total > 0 ? ` Já foram calculadas ${inteiro(total)} ação(ões); clique de novo para continuar.` : "") });
          router.refresh();
          return;
        }
        total += json.processadas ?? 0;
        if (json.terminou || (json.processadas ?? 0) === 0) {
          setMsg({ tipo: "ok", texto: `${inteiro(total)} ação(ões) calculada(s). A tela já está atualizada.` });
          router.refresh();
          return;
        }
        setMsg({ tipo: "ok", texto: `Calculando... ${inteiro(total)} ação(ões) até agora.` });
      }
      setMsg({ tipo: "ok", texto: `${inteiro(total)} ação(ões) calculadas. Clique de novo para continuar.` });
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "Sem conexão com o servidor." + (total > 0 ? ` Já foram calculadas ${inteiro(total)}; clique de novo para continuar.` : "") });
    } finally {
      setAtualizando(false);
    }
  }

  if (!ehAdmin) return <p className="text-[11px] text-ink-muted">Para localizar mais ações nos territórios, um admin ou chefe precisa rodar a atualização.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => atualizar(false)} disabled={atualizando} className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-plane disabled:opacity-60" title="Calcula os bairros, a zona e o território das ações com traçado novo ou ainda não calculado">
        {atualizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {atualizando ? "Calculando..." : "Atualizar localização"}
      </button>
      <button
        onClick={() => {
          if (window.confirm("Refazer o cálculo de todas as ações? Leva alguns minutos; o que está na tela só muda quando terminar.")) atualizar(true);
        }}
        disabled={atualizando}
        className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-60"
        title="Esquece os cálculos guardados e refaz todos"
      >
        Refazer tudo
      </button>
      {msg && <span className={"text-xs font-medium " + (msg.tipo === "ok" ? "text-status-good" : "text-status-critical")}>{msg.texto}</span>}
    </div>
  );
}

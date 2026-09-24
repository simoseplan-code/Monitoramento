"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

// apenasSugestoes: roda só a etapa 2 (recalcula a fila de Unidade/Quantidade
// a partir das obras que já estão no banco, sem baixar nada do SIMO) —
// usado na própria tela de Unidade/Quantidade.
export function SincronizarBotao({ apenasSugestoes = false }: { apenasSugestoes?: boolean }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [etapa, setEtapa] = useState("");

  // Uma etapa por requisição (cada uma tem o seu limite de tempo no
  // servidor): 1) obras do SIMO, 2) fila de Unidade/Quantidade.
  async function chamar(fase: "obras" | "sugestoes"): Promise<{ ok: boolean; texto: string }> {
    const resp = await fetch("/api/admin/sync-simo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fase }),
    });
    // Resposta que não é JSON = o servidor foi cortado antes de responder
    // (timeout devolve página de erro) — mostra o status em vez de esconder.
    const bruto = await resp.text();
    let data: { linhas?: number; naFila?: number; error?: string } | null = null;
    try {
      data = JSON.parse(bruto);
    } catch {
      // não é JSON
    }
    if (data && resp.ok) {
      return { ok: true, texto: fase === "obras" ? `${data.linhas} ações` : `${data.naFila} na fila de Unidade/Quantidade` };
    }
    return { ok: false, texto: data?.error ?? `servidor respondeu HTTP ${resp.status} sem detalhes (provável timeout — veja o histórico abaixo)` };
  }

  async function sincronizar() {
    setCarregando(true);
    setMsg(null);
    try {
      if (apenasSugestoes) {
        const so = await chamar("sugestoes");
        setMsg(so.ok ? { tipo: "ok", texto: `✅ ${so.texto}.` } : { tipo: "erro", texto: `❌ ${so.texto}` });
        return;
      }
      setEtapa("1/2 obras do SIMO");
      const obras = await chamar("obras");
      if (!obras.ok) {
        setMsg({ tipo: "erro", texto: `❌ Etapa 1 (obras): ${obras.texto}` });
        return;
      }
      setEtapa("2/2 fila de Unidade/Quantidade");
      const sugestoes = await chamar("sugestoes");
      if (!sugestoes.ok) {
        setMsg({ tipo: "erro", texto: `❌ Obras ok (${obras.texto}), mas a etapa 2 falhou: ${sugestoes.texto}` });
        return;
      }
      setMsg({ tipo: "ok", texto: `✅ ${obras.texto} sincronizadas · ${sugestoes.texto}.` });
    } catch {
      setMsg({ tipo: "erro", texto: "❌ Falha ao conectar com o servidor." });
    } finally {
      setEtapa("");
      setCarregando(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span className={`text-xs ${msg.tipo === "ok" ? "text-status-good" : "text-status-critical"}`}>{msg.texto}</span>
      )}
      <button
        disabled={carregando}
        onClick={sincronizar}
        className="flex items-center gap-1.5 rounded-lg bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {carregando && <Loader2 size={13} className="animate-spin" />}
        {carregando ? (apenasSugestoes ? "Recalculando..." : `Sincronizando ${etapa}...`) : apenasSugestoes ? "Recalcular sugestões" : "Sincronizar agora"}
      </button>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";

export function UploadCsvSobreposicoes() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setResultado(null);
    try {
      const csv = await arquivo.text();
      const res = await fetch("/api/sobreposicoes/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setResultado({ tipo: "erro", texto: dados.error ?? "Falha ao importar." });
      } else {
        setResultado({
          tipo: "ok",
          texto:
            `${dados.total} local(is) no arquivo — ${dados.novos} novo(s), ${dados.jaExistiam} já estavam cadastrados (decisão preservada)` +
            (dados.carregadosAutomaticamente > 0
              ? `, ${dados.carregadosAutomaticamente} reconhecido(s) como já revisado(s) antes (mesma combinação de obras, chave diferente).`
              : "."),
        });
        router.refresh();
      }
    } catch {
      setResultado({ tipo: "erro", texto: "Não consegui ler o arquivo." });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-primary">Importar CSV de sobreposições</p>
          <p className="text-xs text-ink-muted">
            Gerado no Mapa de Obras, aba &quot;Sobreposição de Trechos&quot; → Exportar CSV. Locais já revisados
            mantêm a decisão — só os novos entram como pendentes.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-series-1 px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? "Importando..." : "Escolher CSV"}
          <input ref={inputRef} type="file" accept=".csv" onChange={aoEscolherArquivo} disabled={enviando} className="hidden" />
        </label>
      </div>

      {resultado && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            resultado.tipo === "ok" ? "bg-status-good-bg text-status-good" : "bg-status-warning-bg text-status-warning"
          }`}
        >
          {resultado.texto}
        </p>
      )}
    </div>
  );
}

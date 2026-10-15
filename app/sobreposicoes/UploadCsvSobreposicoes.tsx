"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { emLotes, separarGeometria } from "@/lib/sobreposicoes/geometria";

export function UploadCsvSobreposicoes() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setResultado(null);
    try {
      setEtapa("Lendo o arquivo...");
      // A geometria (WKT) é separada aqui, sem repetição: o arquivo inteiro passa de
      // 100 MB e o servidor só aceita alguns MB por envio.
      const { csvLeve: csv, geomPorLocal, tracadoPorObra } = separarGeometria(await arquivo.text());
      setEtapa("Importando os locais...");
      const res = await fetch("/api/sobreposicoes/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setResultado({ tipo: "erro", texto: dados.error ?? "Falha ao importar." });
      } else {
        const lotes = [
          ...emLotes(Array.from(geomPorLocal, ([chave, geoms]) => ({ chave, geoms }))).map((locais) => ({ locais })),
          ...emLotes(Array.from(tracadoPorObra, ([id, wkt]) => ({ id, wkt }))).map((tracados) => ({ tracados })),
        ];
        let falhaMapa: string | null = null;
        for (let i = 0; i < lotes.length; i++) {
          setEtapa(`Enviando o mapa (${i + 1} de ${lotes.length})...`);
          const r = await fetch("/api/sobreposicoes/geometria", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lotes[i]),
          });
          if (!r.ok) {
            falhaMapa = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Falha ao enviar o mapa.";
            break;
          }
        }
        if (falhaMapa) {
          setResultado({ tipo: "erro", texto: `Locais importados, mas o mapa não foi salvo: ${falhaMapa} Importe o arquivo de novo.` });
          router.refresh();
          return;
        }
        setResultado({
          tipo: "ok",
          texto:
            `${dados.total} local(is) no arquivo: ${dados.novos} novo(s), ${dados.jaExistiam} já existiam` +
            (dados.analiseReaproveitada > 0 ? `, ${dados.analiseReaproveitada} com análise anterior reaproveitada` : "") +
            `. ${dados.removidos} antigo(s) sem análise removido(s)` +
            (dados.analisadosMantidos > 0 ? `, ${dados.analisadosMantidos} já analisado(s) mantido(s) mesmo fora do arquivo.` : "."),
        });
        router.refresh();
      }
    } catch {
      setResultado({ tipo: "erro", texto: "Não consegui ler o arquivo." });
    } finally {
      setEnviando(false);
      setEtapa(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-primary">Ou importar um CSV de sobreposições</p>
          <p className="text-xs text-ink-muted">
            Gerado no Mapa de Obras, aba &quot;Sobreposição de Trechos&quot; → Exportar CSV. O arquivo substitui a lista atual;
            locais que já tiveram análise são mantidos.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-series-1 px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? etapa ?? "Importando..." : "Escolher CSV"}
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

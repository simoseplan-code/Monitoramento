"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, Loader2, Square } from "lucide-react";

type Situacao = "baixado" | "ja_tinha" | "sem_kml" | "erro" | "adiado";
type Item = { id: string; situacao: Situacao; mensagem?: string };

const POR_ENVIO = 10;

// IDs vindos de planilha, e-mail ou texto: aceita quebra de linha, vírgula, ponto e vírgula, espaço.
function lerIds(texto: string): string[] {
  const ids = texto.split(/[^0-9]+/).filter((s) => s.length >= 1 && s.length <= 12);
  return Array.from(new Set(ids));
}

export function LoteKml({ importadosSemArquivo = [] }: { importadosSemArquivo?: string[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [forcar, setForcar] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feitos, setFeitos] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const parar = useRef(false);

  const ids = lerIds(texto);
  const cont = (s: Situacao) => feitos.filter((f) => f.situacao === s).length;

  async function iniciar() {
    if (ids.length === 0) return;
    parar.current = false;
    setRodando(true);
    setErro(null);
    setFeitos([]);
    setTotal(ids.length);

    let fila = [...ids];
    const acumulado: Item[] = [];
    try {
      while (fila.length > 0 && !parar.current) {
        const lote = fila.slice(0, POR_ENVIO);
        fila = fila.slice(POR_ENVIO);
        const resp = await fetch("/api/kml/lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: lote, forcar }),
        });
        const json = (await resp.json().catch(() => ({}))) as { error?: string; resultados?: Item[] };
        if (!resp.ok || !json.resultados) {
          setErro(json.error ?? "Não foi possível continuar.");
          break;
        }
        // O servidor devolve "adiado" quando está perto do limite de tempo: volta para a fila.
        const adiados = json.resultados.filter((r) => r.situacao === "adiado").map((r) => r.id);
        const prontos = json.resultados.filter((r) => r.situacao !== "adiado");
        acumulado.push(...prontos);
        setFeitos([...acumulado]);
        if (adiados.length > 0) fila = [...adiados, ...fila];
      }
    } catch {
      setErro("Sem conexão com o servidor. Os que já foram feitos ficaram guardados.");
    } finally {
      setRodando(false);
      router.refresh();
    }
  }

  const andamento = total > 0 ? Math.round((feitos.length / total) * 100) : 0;
  const problemas = feitos.filter((f) => f.situacao === "sem_kml" || f.situacao === "erro");

  return (
    <div className="space-y-3">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={rodando}
        rows={5}
        placeholder={"Cole aqui os IDs das ações, um por linha ou separados por vírgula.\nExemplo:\n18239\n18257\n17540"}
        className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 font-mono text-xs text-ink-primary focus:border-series-1 focus:outline-none disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          {importadosSemArquivo.length > 0 && (
            <button
              type="button"
              onClick={() => setTexto(importadosSemArquivo.join(", "))}
              disabled={rodando}
              className="w-fit rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-plane disabled:opacity-50"
              title="Cola no campo os IDs que já têm traçado vindo do mapa mas ainda não têm o arquivo KML guardado"
            >
              Preencher com os {importadosSemArquivo.length.toLocaleString("pt-BR")} importados do mapa que ainda não baixei
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} disabled={rodando} className="h-3.5 w-3.5" />
          Baixar de novo mesmo os que já tenho guardados (substitui o arquivo guardado)
        </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">{ids.length > 0 ? `${ids.length.toLocaleString("pt-BR")} ID(s) reconhecido(s)` : "Nenhum ID ainda"}</span>
          {rodando ? (
            <button
              onClick={() => (parar.current = true)}
              className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-ink-secondary hover:bg-plane"
            >
              <Square size={13} /> Parar
            </button>
          ) : (
            <button
              onClick={iniciar}
              disabled={ids.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-series-1 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Download size={13} /> Buscar KMLs no SIMO
            </button>
          )}
        </div>
      </div>

      {(rodando || feitos.length > 0) && (
        <div className="space-y-2 rounded-lg border border-black/5 p-3">
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            {rodando && <Loader2 size={13} className="animate-spin" />}
            <span>
              {feitos.length.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} ({andamento}%)
              {rodando ? ": buscando no SIMO, pode deixar esta tela aberta..." : parar.current ? ": parado" : ": concluído"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-plane">
            <div className="h-full rounded-full bg-series-1 transition-all" style={{ width: `${andamento}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-status-good">Baixados: {cont("baixado")}</span>
            <span className="text-ink-secondary">Já tinha: {cont("ja_tinha")}</span>
            <span className="text-status-warning">Sem KML no SIMO: {cont("sem_kml")}</span>
            <span className="text-status-critical">Erro: {cont("erro")}</span>
          </p>
          {problemas.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink-secondary">
              {problemas.map((p) => (
                <li key={p.id}>
                  <span className="font-medium text-ink-primary">{p.id}</span>: {p.situacao === "sem_kml" ? "o SIMO não tem KML anexado" : p.mensagem ?? "erro ao baixar"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {erro && <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}

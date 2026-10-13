"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Loader2, Map as MapIcon, X } from "lucide-react";
import type { Map as MapaLeaflet } from "leaflet";
import { wktParaLinhas } from "@/lib/sobreposicoes/geometria";

type ObraLegenda = { id: string | null; nome: string; orgao: string | null };
type Dados = { sobreposta: string[]; tracados: { id_acao: string; wkt: string }[] };

// Uma cor por obra (a primeira é a principal); o trecho sobreposto fica em vermelho por cima.
const CORES_OBRAS = ["#2563eb", "#f59e0b", "#7c3aed", "#0d9488", "#db2777"];
const COR_SOBREPOSTA = "#dc2626";

export function MapaSobreposicaoBotao({ chaveLocal, obras }: { chaveLocal: string; obras: ObraLegenda[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button onClick={() => setAberto(true)} className="inline-flex items-center gap-1 text-series-1 hover:underline">
        <MapIcon size={12} /> Mostrar sobreposição
      </button>
      {aberto && <MapaModal chaveLocal={chaveLocal} obras={obras} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function MapaModal({ chaveLocal, obras, aoFechar }: { chaveLocal: string; obras: ObraLegenda[]; aoFechar: () => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  // As obras só servem para cor/legenda: não devem recarregar o mapa a cada render.
  const obrasRef = useRef(obras);
  const [estado, setEstado] = useState<"carregando" | "ok" | "sem_geometria" | "erro">("carregando");

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  useEffect(() => {
    let mapa: MapaLeaflet | null = null;
    let cancelado = false;

    (async () => {
      try {
        const [resp, L] = await Promise.all([
          fetch(`/api/sobreposicoes/mapa?chave=${encodeURIComponent(chaveLocal)}`, { credentials: "same-origin" }),
          import("leaflet"),
        ]);
        if (!resp.ok) throw new Error();
        const dados = (await resp.json()) as Dados;
        if (cancelado || !divRef.current) return;

        const sobreposta = dados.sobreposta.flatMap(wktParaLinhas);
        if (sobreposta.length === 0 && dados.tracados.length === 0) {
          setEstado("sem_geometria");
          return;
        }

        mapa = L.map(divRef.current, { zoomControl: true });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(mapa);

        const grupo = L.featureGroup().addTo(mapa);
        obrasRef.current.forEach((o, i) => {
          const tracado = dados.tracados.find((t) => t.id_acao === o.id);
          if (!tracado) return;
          L.polyline(wktParaLinhas(tracado.wkt), { color: CORES_OBRAS[i % CORES_OBRAS.length], weight: 4, opacity: 0.75 })
            .bindTooltip(`${o.orgao ?? ""} · ID ${o.id}`, { sticky: true })
            .addTo(grupo);
        });
        const camadaSobreposta = L.featureGroup().addTo(mapa);
        L.polyline(sobreposta, { color: COR_SOBREPOSTA, weight: 8, opacity: 0.9 })
          .bindTooltip("Trecho sobreposto", { sticky: true })
          .addTo(camadaSobreposta);

        // Abre enquadrando o trecho sobreposto (é o que interessa); o traçado inteiro continua lá.
        const foco = sobreposta.length > 0 ? camadaSobreposta : grupo;
        mapa.fitBounds(foco.getBounds(), { padding: [40, 40] });
        setEstado("ok");
      } catch {
        if (!cancelado) setEstado("erro");
      }
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [chaveLocal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={aoFechar}>
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-ink-primary">Trecho sobreposto</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-5 rounded" style={{ background: COR_SOBREPOSTA }} /> Sobreposição
              </span>
              {obras.map((o, i) => (
                <span key={o.id ?? o.nome} className="inline-flex min-w-0 items-center gap-1.5" title={o.nome}>
                  <span className="inline-block h-1 w-5 shrink-0 rounded" style={{ background: CORES_OBRAS[i % CORES_OBRAS.length] }} />
                  <span className="truncate">
                    {o.orgao} · ID {o.id}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="relative flex-1">
          <div ref={divRef} className="absolute inset-0" />
          {estado !== "ok" && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-ink-muted">
              {estado === "carregando" && (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Carregando o mapa...
                </span>
              )}
              {estado === "sem_geometria" && "Este local ainda não tem o desenho do trecho. Importe o CSV novo do Mapa de Obras (com as colunas WKT)."}
              {estado === "erro" && "Não foi possível carregar o mapa."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

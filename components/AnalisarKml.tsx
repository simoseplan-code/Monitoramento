"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Info, Loader2, OctagonAlert, X } from "lucide-react";
import type { Map as MapaLeaflet } from "leaflet";
import type { ResultadoKml } from "@/lib/kml/analisar";
import { urlAcaoSimo } from "@/components/IdAcaoLink";

const CORES_OUTRAS = ["#f59e0b", "#0d9488", "#db2777", "#7c3aed", "#65a30d", "#0891b2", "#b45309", "#4f46e5"];

const km = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function AnalisarKmlBotao({ idAcao, nomeAcao, kmlGuardado = false }: { idAcao: string; nomeAcao?: string; kmlGuardado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  // Verde = o KML desta ação já foi baixado e está guardado; branco = ainda não.
  const [guardado, setGuardado] = useState(kmlGuardado);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={guardado ? "KML já guardado: abre direto a análise (sem baixar do SIMO)" : "Baixa o KML anexado no SIMO, guarda e analisa"}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          guardado ? "border-status-good/30 bg-status-good-bg text-status-good hover:opacity-80" : "border-black/10 text-ink-secondary hover:bg-plane"
        }`}
      >
        {guardado ? <CheckCircle2 size={13} /> : <FileSearch size={13} />} Analisar KML
      </button>
      {aberto && <JanelaKml idAcao={idAcao} nomeAcao={nomeAcao} aoGuardar={() => setGuardado(true)} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function JanelaKml({ idAcao, nomeAcao, aoGuardar, aoFechar }: { idAcao: string; nomeAcao?: string; aoGuardar: () => void; aoFechar: () => void }) {
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoKml | null>(null);
  const [semKml, setSemKml] = useState(false);
  const [origem, setOrigem] = useState<{ tipo: "envio" | "guardado" | "simo" | "simo_sem_guardar"; guardadoEm: string | null } | null>(null);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  // Sem arquivo: usa o KML guardado da ação; se ainda não houver (ou se pedir "baixar de novo"),
  // o servidor baixa do SIMO pelo ID, guarda e analisa.
  async function analisar(arquivo?: File, forcar = false) {
    setAnalisando(true);
    setErro(null);
    setSemKml(false);
    setResultado(null);
    try {
      const form = new FormData();
      if (arquivo) form.append("arquivo", arquivo);
      form.append("idAcao", idAcao);
      if (forcar) form.append("forcar", "1");
      const resp = await fetch("/api/kml/analisar", { method: "POST", body: form });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; resultado?: ResultadoKml; semKml?: boolean; origem?: "envio" | "guardado" | "simo" | "simo_sem_guardar"; guardadoEm?: string | null };
      if (!resp.ok || !json.resultado) {
        setErro(json.error ?? "Não foi possível analisar o arquivo.");
        setSemKml(!!json.semKml);
      } else {
        setResultado(json.resultado);
        setOrigem({ tipo: json.origem ?? "envio", guardadoEm: json.guardadoEm ?? null });
        if (json.origem === "guardado" || json.origem === "simo") aoGuardar();
      }
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setAnalisando(false);
    }
  }

  // Ao abrir, já analisa (do KML guardado ou baixando do SIMO).
  useEffect(() => {
    analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={aoFechar}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary">Análise do KML · ação {idAcao}</p>
            {nomeAcao && <p className="truncate text-xs text-ink-muted" title={nomeAcao}>{nomeAcao}</p>}
          </div>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {analisando && (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-plane px-4 py-6 text-xs text-ink-secondary">
              <Loader2 size={16} className="animate-spin" /> Buscando o KML da ação e analisando...
            </p>
          )}

          {erro && (
            <p className={`rounded-lg px-3 py-2 text-xs ${semKml ? "bg-status-warning-bg text-status-warning" : "bg-status-critical/10 text-status-critical"}`}>
              {semKml ? (
                <>
                  <strong className="block text-sm">KML NÃO ANEXADO. ATENÇÃO: SOLICITE AO ÓRGÃO.</strong>
                  <span className="mt-0.5 block">Não encontrei KML anexado a essa ação no SIMO (aba Trechos).</span>
                </>
              ) : (
                erro
              )}
            </p>
          )}

          {resultado && origem && (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-plane px-3 py-2 text-[11px] text-ink-secondary">
              <span>
                {origem.tipo === "guardado" && `KML guardado${origem.guardadoEm ? " em " + new Date(origem.guardadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}: não foi preciso baixar do SIMO.`}
                {origem.tipo === "simo" && "KML baixado agora do SIMO e guardado para as próximas análises."}
                {origem.tipo === "envio" && "Arquivo enviado por você: analisado, mas não guardado."}
                {origem.tipo === "simo_sem_guardar" && "KML baixado do SIMO e analisado, mas não foi possível guardá-lo agora (o botão continua branco)."}
              </span>
              {origem.tipo === "guardado" && (
                <button onClick={() => analisar(undefined, true)} disabled={analisando} className="font-semibold text-series-1 hover:underline disabled:opacity-50">
                  Baixar de novo do SIMO
                </button>
              )}
            </p>
          )}
          {resultado && <Resultado r={resultado} />}

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              analisar(e.dataTransfer.files?.[0]);
            }}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-black/10 px-4 py-3 text-center text-[11px] text-ink-muted hover:bg-plane"
          >
            <span className="font-medium text-ink-secondary">Analisar outro arquivo: escolha ou solte aqui um KML/KMZ (até 4 MB)</span>
            <input type="file" accept=".kml,.kmz" className="hidden" disabled={analisando} onChange={(e) => analisar(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

function Resultado({ r }: { r: ResultadoKml }) {
  const c = r.contagem;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        Arquivo: <span className="font-medium text-ink-secondary">{r.arquivo}</span>
        {r.nomeDocumento ? ` · documento "${r.nomeDocumento}"` : ""}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Tile rotulo="Pontos" valor={String(c.pontos)} />
        <Tile rotulo="Trechos (linhas)" valor={String(c.linhas)} />
        <Tile rotulo="Polígonos" valor={String(c.poligonos)} />
        <Tile rotulo="Extensão dos trechos" valor={`${km(r.extensaoKm)} km`} />
        <Tile rotulo="Municípios" valor={String(r.municipios.length)} />
        <Tile rotulo="Vértices" valor={String(c.vertices)} />
      </div>

      <div className="space-y-1.5">
        {r.alertas.map((a, i) => (
          <p
            key={i}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              a.nivel === "erro"
                ? "bg-status-critical/10 text-status-critical"
                : a.nivel === "aviso"
                  ? "bg-status-warning-bg text-status-warning"
                  : "bg-plane text-ink-secondary"
            }`}
          >
            {a.nivel === "erro" ? <OctagonAlert size={14} className="mt-px shrink-0" /> : a.nivel === "aviso" ? <AlertTriangle size={14} className="mt-px shrink-0" /> : a.texto.startsWith("Nenhum problema") ? <CheckCircle2 size={14} className="mt-px shrink-0 text-status-good" /> : <Info size={14} className="mt-px shrink-0" />}
            <span>{a.texto}</span>
          </p>
        ))}
      </div>

      {r.mapa.linhas.length + r.mapa.poligonos.length + r.mapa.pontos.length > 0 && <MapaKml r={r} />}

      {r.sobreposicoesNaBase && r.sobreposicoesNaBase.itens.length > 0 && (
        <section className="rounded-lg border border-status-warning/30 bg-status-warning-bg/40 px-3 py-2">
          <h3 className="mb-1 text-xs font-semibold text-status-warning">Pode estar sobreposta a:</h3>
          <ul className="space-y-1 text-xs text-ink-secondary">
            {r.sobreposicoesNaBase.itens.map((s, i) => (
              <li key={s.idAcao} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: CORES_OUTRAS[i % CORES_OUTRAS.length] }} />
                <span className="min-w-0">
                  <a href={urlAcaoSimo(s.idAcao)} target="_blank" rel="noopener noreferrer" className="font-semibold text-series-1 hover:underline">
                    {s.idAcao}
                  </a>
                  {s.orgao ? ` · ${s.orgao}` : ""} · <span className="font-medium text-ink-primary">{s.metros.toLocaleString("pt-BR")} m em comum</span>
                  {s.fonte === "kml" && <span className="ml-1 rounded bg-plane px-1 text-[10px] text-ink-muted" title="Traçado vindo do KML guardado (a atualização do mapa ainda não tem esta ação)">KML guardado</span>}
                  {s.nome && <span className="block truncate text-ink-muted" title={s.nome}>{s.nome}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.municipios.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Municípios</h3>
          <div className="overflow-x-auto rounded-lg border border-black/5">
            <table className="w-full text-xs">
              <thead className="bg-plane text-left text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Município</th>
                  <th className="px-3 py-2">Território</th>
                  <th className="px-3 py-2 text-right">Trechos</th>
                  <th className="px-3 py-2 text-right">% da extensão</th>
                  <th className="px-3 py-2 text-right">Pontos</th>
                  <th className="px-3 py-2 text-right">Polígonos</th>
                </tr>
              </thead>
              <tbody>
                {r.municipios.map((m) => (
                  <tr key={m.codigo} className="border-t border-black/5">
                    <td className="px-3 py-1.5 font-medium text-ink-primary">{m.nome}</td>
                    <td className="px-3 py-1.5 text-ink-secondary">{m.territorio ?? "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right">{km(m.extensaoKm)} km</td>
                    <td className="tabular px-3 py-1.5 text-right">{m.extensaoKm > 0 ? `${m.percentual.toLocaleString("pt-BR")}%` : "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right">{m.pontos || "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right">{m.poligonos || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.bairros.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Bairros atingidos</h3>
          <div className="flex flex-wrap gap-1.5">
            {r.bairros.map((b) => (
              <span key={b.municipio + b.nome} className="rounded-full bg-plane px-2.5 py-1 text-xs text-ink-secondary">
                {b.nome} <span className="text-ink-muted">({b.municipio})</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {r.linhas.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Trechos {r.contagem.linhas > r.linhas.length ? `(os ${r.linhas.length} maiores de ${r.contagem.linhas})` : ""}
          </h3>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-black/5">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-plane text-left text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Pasta</th>
                  <th className="px-3 py-2 text-right">Extensão</th>
                  <th className="px-3 py-2 text-right">Vértices</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas.map((l, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <td className="px-3 py-1.5 text-ink-primary">{l.nome}</td>
                    <td className="px-3 py-1.5 text-ink-secondary">{l.pasta ?? "-"}</td>
                    <td className="tabular px-3 py-1.5 text-right">{km(l.km)} km</td>
                    <td className="tabular px-3 py-1.5 text-right">{l.vertices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.pontos.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Pontos {r.contagem.pontos > r.pontos.length ? `(os primeiros ${r.pontos.length} de ${r.contagem.pontos})` : ""}
          </h3>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-black/5">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-plane text-left text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Município</th>
                  <th className="px-3 py-2 text-right">Latitude, longitude</th>
                </tr>
              </thead>
              <tbody>
                {r.pontos.map((p, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <td className="px-3 py-1.5 text-ink-primary">{p.nome}</td>
                    <td className="px-3 py-1.5 text-ink-secondary">{p.municipio ?? "fora dos limites"}</td>
                    <td className="tabular px-3 py-1.5 text-right">
                      {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.caixa && r.centro && (
        <p className="text-xs text-ink-muted">
          Centro: {r.centro.lat.toFixed(5)}, {r.centro.lon.toFixed(5)} · área desenhada de {km((r.caixa.leste - r.caixa.oeste) * 111 * Math.cos((r.centro.lat * Math.PI) / 180))} km (leste-oeste) por{" "}
          {km((r.caixa.norte - r.caixa.sul) * 111)} km (norte-sul)
          {r.areaHa > 0 ? ` · polígonos somam ${km(r.areaHa)} ha` : ""}
          {r.gruposDeTrechos > 1 ? ` · ${r.gruposDeTrechos} grupos de trechos sem ligação` : ""}
        </p>
      )}
    </div>
  );
}

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-black/5 px-3 py-2">
      <p className="tabular text-base font-semibold text-ink-primary">{valor}</p>
      <p className="text-[11px] text-ink-muted">{rotulo}</p>
    </div>
  );
}

function MapaKml({ r }: { r: ResultadoKml }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mapa: MapaLeaflet | null = null;
    let cancelado = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelado || !divRef.current) return;
      mapa = L.map(divRef.current);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(mapa);
      const grupo = L.featureGroup().addTo(mapa);
      (r.mapa.outras ?? []).forEach((o, i) => {
        for (const l of o.linhas) L.polyline(l, { color: CORES_OUTRAS[i % CORES_OUTRAS.length], weight: 5, opacity: 0.75, dashArray: "8 6" }).bindTooltip(`Ação ${o.idAcao}`, { sticky: true }).addTo(grupo);
      });
      for (const l of r.mapa.linhas) L.polyline(l, { color: "#dc2626", weight: 3, opacity: 0.9 }).addTo(grupo);
      for (const p of r.mapa.poligonos) L.polygon(p, { color: "#7c3aed", weight: 2, fillOpacity: 0.2 }).addTo(grupo);
      for (const p of r.mapa.pontos) L.circleMarker([p.lat, p.lon], { radius: 5, color: "#1d4ed8", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.9 }).bindTooltip(p.nome || "(sem nome)").addTo(grupo);
      const b = grupo.getBounds();
      if (b.isValid()) mapa.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
      else mapa.setView([-7.5, -43], 6);
    })();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [r]);
  return <div ref={divRef} className="h-72 w-full overflow-hidden rounded-lg border border-black/5" />;
}

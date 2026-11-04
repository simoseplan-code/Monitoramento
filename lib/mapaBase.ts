// Tipos de mapa (fundo) dos mapas do painel: ruas, satélite, satélite com nomes, relevo e claro.
// A escolha da pessoa fica guardada no navegador. Cada endereço de imagem precisa estar na lista "img-src" da
// política de segurança (next.config.mjs).
import type { Map as MapaLeaflet } from "leaflet";

type L = typeof import("leaflet");

const CHAVE = "mapa_base";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** Escolha anterior da pessoa (se o navegador deixar guardar). */
function lerEscolha(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function guardarEscolha(nome: string) {
  try {
    window.localStorage.setItem(CHAVE, nome);
  } catch {
    // navegador sem armazenamento: a escolha vale só até recarregar
  }
}

/**
 * Coloca o fundo do mapa e o seletor de tipo (ruas, satélite...). \`deslocarTopo\` empurra o seletor para baixo
 * (em pixels) quando há outro botão no canto superior direito.
 */
export function adicionarBases(L: L, mapa: MapaLeaflet, deslocarTopo = 0): void {
  const ruas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" });
  const satelite = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" });
  const sateliteNomes = L.layerGroup([
    L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics" }),
    L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 }),
  ]);
  const relevo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, subdomains: "abc", attribution: "&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap (CC-BY-SA)" });
  const claro = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: "&copy; OpenStreetMap, &copy; CARTO" });

  const bases: Record<string, import("leaflet").Layer> = {
    "Mapa (ruas)": ruas,
    "Satélite": satelite,
    "Satélite com nomes": sateliteNomes,
    "Relevo": relevo,
    "Mapa claro": claro,
  };
  const escolhida = lerEscolha();
  (bases[escolhida ?? ""] ?? ruas).addTo(mapa);

  const controle = L.control.layers(bases, undefined, { position: "topright", collapsed: true });
  controle.addTo(mapa);
  if (deslocarTopo > 0) controle.getContainer()!.style.marginTop = `${deslocarTopo}px`;
  mapa.on("baselayerchange", (e: { name: string }) => guardarEscolha(e.name));
}

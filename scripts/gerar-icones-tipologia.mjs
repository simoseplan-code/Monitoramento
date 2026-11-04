// Gera lib/tipologiaIconesSvg.ts: o desenho (SVG) dos símbolos do mapa de traçados, tirado dos ícones do lucide
// (ISC), já instalados no projeto. Uso: node scripts/gerar-icones-tipologia.mjs
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const ICONES = [
  "graduation-cap", "route", "tractor", "bridge", "droplets", "droplet", "waves-horizontal", "trees", "dumbbell", "hospital", "house", "shield",
  "building-complex", "landmark", "store", "plane", "zap", "wheat", "tent", "church", "bus", "factory", "construction", "map-pin", "toilet", "fence",
];

const saida = {};
for (const nome of ICONES) {
  let mod;
  try {
    mod = await import(pathToFileURL(join(raiz, "node_modules", "lucide-react", "dist", "esm", "icons", nome + ".mjs")).href);
  } catch {
    console.log("sem ícone:", nome);
    continue;
  }
  const dadosIcone = mod.__iconData?.node ?? mod.__iconNode;
  if (!dadosIcone) { console.log("formato desconhecido:", nome, Object.keys(mod)); continue; }
  const filhos = dadosIcone.map(([tag, attrs]) => {
    const a = Object.entries(attrs)
      .filter(([k]) => k !== "key")
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    return `<${tag} ${a}/>`;
  });
  saida[nome] = filhos.join("");
}

const corpo =
  "// GERADO por scripts/gerar-icones-tipologia.mjs a partir dos ícones do lucide (ISC). Não editar à mão.\n" +
  "export const ICONES_SVG: Record<string, string> = " +
  JSON.stringify(saida, null, 2) +
  ";\n";
writeFileSync(join(raiz, "lib", "tipologiaIconesSvg.ts"), corpo);
console.log("ok:", Object.keys(saida).length, "ícones");

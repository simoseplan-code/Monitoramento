// Converte as bases do mapa (municipios.js, bairros_piaui.js) em JSON compactos usados
// pela análise de KML. Rode de novo só se as bases do mapa mudarem:
//   node scripts/preparar-geodados.mjs "<pasta data do mapa>"
import fs from "node:fs";
import path from "node:path";

const pasta = process.argv[2];
if (!pasta) throw new Error('Informe a pasta "data" do mapa.');

function lerJs(arquivo) {
  const t = fs.readFileSync(path.join(pasta, arquivo), "utf8");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
}

const arred = (n) => Math.round(n * 1e4) / 1e4; // ~11 m: sobra para saber o município

function compacta(coords) {
  // MultiPolygon -> [ [ anel ] ]: arredonda e tira pontos repetidos em sequência.
  return coords.map((poligono) =>
    poligono.map((anel) => {
      const saida = [];
      for (const [x, y] of anel) {
        const p = [arred(x), arred(y)];
        const u = saida[saida.length - 1];
        if (!u || u[0] !== p[0] || u[1] !== p[1]) saida.push(p);
      }
      return saida;
    }).filter((anel) => anel.length >= 4)
  ).filter((p) => p.length > 0);
}

function caixa(coords) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const pol of coords) for (const [x, y] of pol[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

const mun = lerJs("municipios.js");
const municipios = [];
for (const f of mun.features) {
  const p = f.properties;
  if (p.SIGLA_UF !== "PI" || !f.geometry.coordinates.length) continue;
  const g = compacta(f.geometry.coordinates);
  if (!g.length) continue;
  municipios.push({
    c: String(p.CD_MUN), n: String(p.NM_MUN).trim(), t: String(p["Territóri"] ?? "").trim() || null,
    a: p["Área KM²"] ?? p.AREA_KM2 ?? null, p: p["População"] ?? null, b: caixa(g), g,
  });
}

const bai = lerJs("bairros_piaui.js");
const bairros = [];
for (const f of bai.features) {
  const p = f.properties;
  if (!f.geometry.coordinates.length) continue;
  const g = compacta(f.geometry.coordinates);
  if (!g.length) continue;
  bairros.push({ n: String(p.Bairros ?? p.NM_BAIRRO ?? "").trim(), m: String(p.NM_MUN ?? "").trim(), z: p.Zona ?? null, b: caixa(g), g });
}

fs.mkdirSync("data/geo", { recursive: true });
fs.writeFileSync("data/geo/municipios_pi.json", JSON.stringify(municipios));
fs.writeFileSync("data/geo/bairros_pi.json", JSON.stringify(bairros));
console.log("municípios:", municipios.length, "bairros:", bairros.length);

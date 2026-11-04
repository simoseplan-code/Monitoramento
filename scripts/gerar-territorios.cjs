// Gera data/geo/territorios_pi.json: o contorno externo de cada um dos 12 territórios de desenvolvimento do Piauí,
// juntando os municípios de cada um (as divisas entre municípios do mesmo território são apagadas).
// Uso: node scripts/gerar-territorios.cjs
const fs = require("fs");
const path = require("path");

const munis = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "geo", "municipios_pi.json"), "utf8"));
const chave = (p) => p[0].toFixed(4) + "," + p[1].toFixed(4);

const porTerritorio = new Map();
for (const m of munis) {
  if (!m.t) continue;
  if (!porTerritorio.has(m.t)) porTerritorio.set(m.t, []);
  porTerritorio.get(m.t).push(m);
}

const saida = [];
for (const [nome, lista] of porTerritorio) {
  // Cada aresta (ponto A -> ponto B, sem direção) que aparece duas vezes é divisa interna: some.
  const arestas = new Map();
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const m of lista) {
    for (const poligono of m.g) {
      for (const anel of poligono) {
        for (let i = 0; i + 1 < anel.length; i++) {
          const a = anel[i];
          const b = anel[i + 1];
          const ka = chave(a);
          const kb = chave(b);
          if (ka === kb) continue;
          const k = ka < kb ? ka + "|" + kb : kb + "|" + ka;
          const x = arestas.get(k);
          if (x) x.n++;
          else arestas.set(k, { n: 1, a, b });
          bb = [Math.min(bb[0], a[0]), Math.min(bb[1], a[1]), Math.max(bb[2], a[0]), Math.max(bb[3], a[0] > 0 ? a[1] : a[1])];
        }
      }
    }
  }
  const externas = Array.from(arestas.values()).filter((x) => x.n === 1);
  // Encadeia as arestas externas em linhas contínuas.
  const vizinhos = new Map();
  const add = (k, i) => {
    if (!vizinhos.has(k)) vizinhos.set(k, []);
    vizinhos.get(k).push(i);
  };
  externas.forEach((x, i) => {
    add(chave(x.a), i);
    add(chave(x.b), i);
  });
  const usada = new Array(externas.length).fill(false);
  const linhas = [];
  for (let i = 0; i < externas.length; i++) {
    if (usada[i]) continue;
    usada[i] = true;
    const linha = [externas[i].a, externas[i].b];
    for (const sentido of [1, 0]) {
      for (;;) {
        const ponta = sentido ? linha[linha.length - 1] : linha[0];
        const prox = (vizinhos.get(chave(ponta)) || []).find((j) => !usada[j]);
        if (prox === undefined) break;
        usada[prox] = true;
        const x = externas[prox];
        const novo = chave(x.a) === chave(ponta) ? x.b : x.a;
        if (sentido) linha.push(novo);
        else linha.unshift(novo);
      }
    }
    linhas.push(linha);
  }
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const l of linhas) for (const p of l) {
    minLon = Math.min(minLon, p[0]); maxLon = Math.max(maxLon, p[0]);
    minLat = Math.min(minLat, p[1]); maxLat = Math.max(maxLat, p[1]);
  }
  const total = Array.from(arestas.values()).length;
  console.log(nome.padEnd(34), "municípios:", String(lista.length).padStart(2), "| arestas:", total, "| externas:", externas.length, "| linhas:", linhas.length);
  saida.push({ n: nome, m: Array.from(new Set(lista.map((m) => m.c))).length, b: [minLon, minLat, maxLon, maxLat], l: linhas });
}
saida.sort((a, b) => a.n.localeCompare(b.n, "pt-BR"));
fs.writeFileSync(path.join(__dirname, "..", "data", "geo", "territorios_pi.json"), JSON.stringify(saida));
console.log("ok:", saida.length, "territórios");

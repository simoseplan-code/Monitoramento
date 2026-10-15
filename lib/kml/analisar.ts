import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

// Análise de KML/KMZ de uma ação: o que tem dentro (pontos, trechos, polígonos), extensão,
// em que municípios/bairros cai e conferências que ajudam a decidir o item "KML anexado".

type Coord = [number, number]; // [lon, lat]

export type FeicaoKml = {
  tipo: "ponto" | "linha" | "poligono";
  nome: string;
  pasta: string | null;
  descricao: string | null;
  coords: Coord[];
};

export type Alerta = { nivel: "erro" | "aviso" | "info"; texto: string };

export type MunicipioAtingido = {
  nome: string;
  codigo: string;
  territorio: string | null;
  pontos: number;
  poligonos: number;
  extensaoKm: number;
  percentual: number;
};

export type SobreposicaoNaBase = {
  idAcao: string;
  nome: string | null;
  orgao: string | null;
  status: string | null;
  fonte: "sobreposicoes" | "kml";
  metros: number;
  pctDoKml: number;
  pctDaOutra: number;
};

export type ResultadoKml = {
  arquivo: string;
  nomeDocumento: string | null;
  contagem: { feicoes: number; pontos: number; linhas: number; poligonos: number; pastas: number; vertices: number };
  extensaoKm: number;
  areaHa: number;
  linhas: { nome: string; pasta: string | null; km: number; vertices: number }[];
  pontos: { nome: string; lat: number; lon: number; municipio: string | null }[];
  caixa: { oeste: number; sul: number; leste: number; norte: number } | null;
  centro: { lat: number; lon: number } | null;
  municipios: MunicipioAtingido[];
  foraDoPiaui: number;
  bairros: { nome: string; municipio: string; amostras: number }[];
  gruposDeTrechos: number;
  alertas: Alerta[];
  /** Trechos deste KML que correm junto de trechos de outras ações já na base. */
  sobreposicoesNaBase?: { comparadas: number; toleranciaM: number; itens: SobreposicaoNaBase[] } | null;
  nomeAcao: { extensaoKm: number | null; municipios: string[] } | null;
  mapa: {
    linhas: [number, number][][];
    pontos: { nome: string; lat: number; lon: number }[];
    poligonos: [number, number][][];
    /** Traçado das outras ações que se sobrepõem (id + linhas), para desenhar no mapa. */
    outras?: { idAcao: string; linhas: [number, number][][] }[];
  };
};

// ---------- leitura ----------

const ARRAYS = new Set(["Folder", "Placemark", "Point", "LineString", "Polygon", "MultiGeometry", "LinearRing", "Track", "innerBoundaryIs", "Document"]);

function lista<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function texto(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return texto(o["#text"] ?? "");
  }
  return String(v).trim();
}

function lerCoordenadas(bruto: unknown): Coord[] {
  const s = texto(bruto);
  if (!s) return [];
  const saida: Coord[] = [];
  for (const parte of s.split(/\s+/)) {
    const [lon, lat] = parte.split(",").map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) saida.push([lon, lat]);
  }
  return saida;
}

export async function textoDoArquivo(buffer: Buffer): Promise<string> {
  // KMZ é um zip (começa com "PK"): o KML fica dentro, normalmente como doc.kml.
  if (buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buffer);
    const nomes = Object.keys(zip.files).filter((n) => !zip.files[n].dir && n.toLowerCase().endsWith(".kml"));
    if (nomes.length === 0) throw new Error("O KMZ não tem nenhum arquivo .kml dentro.");
    const escolhido = nomes.find((n) => n.toLowerCase() === "doc.kml") ?? nomes[0];
    return zip.files[escolhido].async("string");
  }
  return buffer.toString("utf8");
}

export function lerKml(xml: string): { nomeDocumento: string | null; feicoes: FeicaoKml[]; pastas: number } {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    isArray: (nome) => ARRAYS.has(nome),
    parseTagValue: false,
    trimValues: true,
  });
  const arvore = parser.parse(xml) as Record<string, unknown>;
  const kml = arvore.kml as Record<string, unknown> | undefined;
  if (!kml) throw new Error("O arquivo não é um KML válido (não achei a marcação <kml>).");

  const feicoes: FeicaoKml[] = [];
  let pastas = 0;
  let nomeDocumento: string | null = null;

  function geometrias(g: Record<string, unknown>, nome: string, pasta: string | null, descricao: string | null) {
    for (const p of lista(g.Point as Record<string, unknown>[])) {
      const c = lerCoordenadas(p.coordinates);
      if (c.length) feicoes.push({ tipo: "ponto", nome, pasta, descricao, coords: [c[0]] });
    }
    for (const l of lista(g.LineString as Record<string, unknown>[])) {
      const c = lerCoordenadas(l.coordinates);
      if (c.length) feicoes.push({ tipo: "linha", nome, pasta, descricao, coords: c });
    }
    // Trilhas do Google Earth (gx:Track): "lon lat alt" em cada gx:coord.
    for (const t of lista(g.Track as Record<string, unknown>[])) {
      const c: Coord[] = lista(t.coord as unknown[])
        .map((x) => texto(x).split(/\s+/).map(Number))
        .filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]))
        .map((v) => [v[0], v[1]] as Coord);
      if (c.length) feicoes.push({ tipo: "linha", nome, pasta, descricao, coords: c });
    }
    for (const pol of lista(g.Polygon as Record<string, unknown>[])) {
      const externo = (pol.outerBoundaryIs as Record<string, unknown> | undefined)?.LinearRing;
      const c = lerCoordenadas(lista(externo as Record<string, unknown>[])[0]?.coordinates);
      if (c.length) feicoes.push({ tipo: "poligono", nome, pasta, descricao, coords: c });
    }
    for (const mg of lista(g.MultiGeometry as Record<string, unknown>[])) geometrias(mg, nome, pasta, descricao);
  }

  function percorrer(no: Record<string, unknown>, pasta: string | null) {
    for (const f of lista(no.Folder as Record<string, unknown>[])) {
      pastas++;
      percorrer(f, texto(f.name) || pasta);
    }
    for (const d of lista(no.Document as Record<string, unknown>[])) {
      if (nomeDocumento === null) nomeDocumento = texto(d.name) || null;
      percorrer(d, pasta);
    }
    for (const pm of lista(no.Placemark as Record<string, unknown>[])) {
      const descricao = texto(pm.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
      geometrias(pm, texto(pm.name), pasta, descricao ? descricao.slice(0, 300) : null);
    }
  }

  nomeDocumento = null;
  percorrer(kml, null);
  return { nomeDocumento, feicoes, pastas };
}

// ---------- geometria ----------

const R = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaM(a: Coord, b: Coord): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function comprimentoM(c: Coord[]): number {
  let t = 0;
  for (let i = 1; i < c.length; i++) t += distanciaM(c[i - 1], c[i]);
  return t;
}

function areaHa(c: Coord[]): number {
  if (c.length < 4) return 0;
  const lat0 = c.reduce((s, p) => s + p[1], 0) / c.length;
  const kx = (Math.PI / 180) * R * Math.cos(rad(lat0));
  const ky = (Math.PI / 180) * R;
  let soma = 0;
  for (let i = 0; i < c.length - 1; i++) soma += c[i][0] * kx * (c[i + 1][1] * ky) - c[i + 1][0] * kx * (c[i][1] * ky);
  return Math.abs(soma / 2) / 10000;
}

/** Pontos ao longo da linha, um a cada `passoM` (sempre inclui o primeiro e o último). */
export function amostrar(c: Coord[], passoM: number): Coord[] {
  if (c.length <= 1) return [...c];
  const saida: Coord[] = [c[0]];
  let acumulado = 0;
  for (let i = 1; i < c.length; i++) {
    const d = distanciaM(c[i - 1], c[i]);
    if (d === 0) continue;
    const n = Math.floor((acumulado + d) / passoM);
    for (let k = 1; k <= n; k++) {
      const alvo = k * passoM - acumulado;
      const f = Math.min(1, alvo / d);
      saida.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f]);
    }
    acumulado = (acumulado + d) % passoM;
  }
  saida.push(c[c.length - 1]);
  return saida;
}

type Poligono = Coord[][]; // [anel externo, ...furos]
type Zona = { n: string; b: [number, number, number, number]; g: Poligono[]; c?: string; t?: string | null; m?: string };

function dentroDoAnel(p: Coord, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDaZona(p: Coord, z: Zona): boolean {
  if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) return false;
  for (const poligono of z.g) {
    if (dentroDoAnel(p, poligono[0] as number[][]) && !poligono.slice(1).some((furo) => dentroDoAnel(p, furo as number[][]))) return true;
  }
  return false;
}

let cacheMunicipios: Zona[] | null = null;
let cacheBairros: Zona[] | null = null;

async function municipiosPi(): Promise<Zona[]> {
  if (!cacheMunicipios) {
    const dados = (await import("@/data/geo/municipios_pi.json")).default as unknown as { c: string; n: string; t: string | null; b: Zona["b"]; g: Poligono[] }[];
    cacheMunicipios = dados.map((d) => ({ n: d.n, c: d.c, t: d.t, b: d.b, g: d.g }));
  }
  return cacheMunicipios;
}

async function bairrosPi(): Promise<Zona[]> {
  if (!cacheBairros) {
    const dados = (await import("@/data/geo/bairros_pi.json")).default as unknown as { n: string; m: string; b: Zona["b"]; g: Poligono[] }[];
    cacheBairros = dados.map((d) => ({ n: d.n, m: d.m, b: d.b, g: d.g }));
  }
  return cacheBairros;
}

// ---------- texto da ação ----------

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** "EXTENSÃO DE 37,06 KM" / "10,5KM" / "2.500 M" no nome da ação, em km. */
export function extensaoNoNome(nome: string): number | null {
  const s = semAcento(nome);
  const m = s.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(KM|QUILOMETROS?|M|METROS?)\b(?!\s*2|²)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const km = m[2].startsWith("K") || m[2].startsWith("Q") ? n : n / 1000;
  return km > 0 ? km : null;
}

function municipiosNoNome(nome: string, todos: Zona[]): string[] {
  const s = ` ${semAcento(nome).replace(/[^A-Z0-9]+/g, " ")} `;
  const achados = new Set<string>();
  for (const z of todos) {
    const n = ` ${semAcento(z.n).replace(/[^A-Z0-9]+/g, " ")} `;
    if (s.includes(n)) achados.add(z.n);
  }
  // "Floriano" dentro de "São Félix do Piauí" etc.: fica só o nome mais longo quando um contém o outro.
  const lista = [...achados];
  return lista.filter((a) => !lista.some((b) => b !== a && semAcento(b).includes(semAcento(a))));
}

// ---------- análise ----------

const CAIXA_PI = { oeste: -46.2, sul: -11.1, leste: -40.2, norte: -2.6 };

function simplificar(c: Coord[], max = 400): [number, number][] {
  const passo = Math.max(1, Math.ceil(c.length / max));
  const s: [number, number][] = [];
  for (let i = 0; i < c.length; i += passo) s.push([c[i][1], c[i][0]]);
  const ult = c[c.length - 1];
  if (c.length > 1 && (s[s.length - 1][0] !== ult[1] || s[s.length - 1][1] !== ult[0])) s.push([ult[1], ult[0]]);
  return s;
}

// Linhas completas (sem simplificar) de cada resultado, para comparar com a base sem
// precisar enviá-las ao navegador.
const linhasBrutas = new WeakMap<object, Coord[][]>();
export function linhasDoResultado(r: ResultadoKml): Coord[][] {
  return linhasBrutas.get(r) ?? [];
}

export async function analisarKml(buffer: Buffer, arquivo: string, nomeAcao?: string | null): Promise<ResultadoKml> {
  const xml = await textoDoArquivo(buffer);
  const { nomeDocumento, feicoes, pastas } = lerKml(xml);
  const [municipios, bairros] = await Promise.all([municipiosPi(), bairrosPi()]);
  const alertas: Alerta[] = [];

  const pontosF = feicoes.filter((f) => f.tipo === "ponto");
  const linhasF = feicoes.filter((f) => f.tipo === "linha");
  const poligonosF = feicoes.filter((f) => f.tipo === "poligono");
  const vertices = feicoes.reduce((s, f) => s + f.coords.length, 0);

  if (feicoes.length === 0) alertas.push({ nivel: "erro", texto: "O KML não tem nenhum ponto, trecho ou polígono: está vazio." });

  // Extensão
  const linhas = linhasF.map((f) => ({ nome: f.nome || "(sem nome)", pasta: f.pasta, km: comprimentoM(f.coords) / 1000, vertices: f.coords.length }));
  const extensaoKm = linhas.reduce((s, l) => s + l.km, 0);
  const area = poligonosF.reduce((s, f) => s + areaHa(f.coords), 0);

  // Caixa e centro
  const todas = feicoes.flatMap((f) => f.coords);
  let caixa: ResultadoKml["caixa"] = null;
  let centro: ResultadoKml["centro"] = null;
  if (todas.length) {
    caixa = {
      oeste: Math.min(...todas.map((c) => c[0])),
      sul: Math.min(...todas.map((c) => c[1])),
      leste: Math.max(...todas.map((c) => c[0])),
      norte: Math.max(...todas.map((c) => c[1])),
    };
    centro = { lat: (caixa.sul + caixa.norte) / 2, lon: (caixa.oeste + caixa.leste) / 2 };
  }

  // Coordenadas fora do Piauí / inválidas
  const fora = todas.filter((c) => c[0] < CAIXA_PI.oeste || c[0] > CAIXA_PI.leste || c[1] < CAIXA_PI.sul || c[1] > CAIXA_PI.norte);
  if (todas.some((c) => c[0] === 0 && c[1] === 0)) alertas.push({ nivel: "erro", texto: "Há coordenada 0,0 (ponto no meio do oceano): geometria mal preenchida." });
  if (fora.length > 0) {
    alertas.push({
      nivel: "erro",
      texto: `${fora.length} de ${todas.length} coordenada(s) estão fora do Piauí. Confira se a latitude/longitude não está trocada ou o desenho é de outro estado.`,
    });
  }

  // Município por amostra (pontos: o próprio ponto; trechos: um ponto a cada ~100 m)
  const porMun = new Map<string, MunicipioAtingido>();
  const porBairro = new Map<string, { nome: string; municipio: string; amostras: number }>();
  let semMunicipio = 0;
  const bairrosPorMun = new Set(bairros.map((b) => b.m));

  function achar<T extends Zona>(p: Coord, zonas: T[]): T | null {
    for (const z of zonas) if (dentroDaZona(p, z)) return z;
    return null;
  }

  function registrar(p: Coord, pesoM: number, tipo: "ponto" | "linha" | "poligono", poligonosDoMun?: Set<string>): string | null {
    const m = achar(p, municipios);
    if (!m) {
      semMunicipio++;
      return null;
    }
    const chave = m.c!;
    const atual = porMun.get(chave) ?? { nome: m.n, codigo: chave, territorio: m.t ?? null, pontos: 0, poligonos: 0, extensaoKm: 0, percentual: 0 };
    if (tipo === "ponto") atual.pontos++;
    else if (tipo === "linha") atual.extensaoKm += pesoM / 1000;
    else if (poligonosDoMun && !poligonosDoMun.has(chave)) {
      poligonosDoMun.add(chave);
      atual.poligonos++;
    }
    porMun.set(chave, atual);
    if (bairrosPorMun.has(m.n)) {
      const b = achar(p, bairros.filter((x) => x.m === m.n));
      if (b) {
        const k = `${m.n}|${b.n}`;
        const cur = porBairro.get(k) ?? { nome: b.n, municipio: m.n, amostras: 0 };
        cur.amostras++;
        porBairro.set(k, cur);
      }
    }
    return m.n;
  }

  const pontosSaida: ResultadoKml["pontos"] = [];
  for (const f of pontosF) {
    const m = registrar(f.coords[0], 0, "ponto");
    pontosSaida.push({ nome: f.nome || "(sem nome)", lat: f.coords[0][1], lon: f.coords[0][0], municipio: m });
  }
  // Limite de amostras para não pesar com KMLs enormes.
  const totalM = linhasF.reduce((s, f) => s + comprimentoM(f.coords), 0) + poligonosF.reduce((s, f) => s + comprimentoM(f.coords), 0);
  const passo = Math.max(100, Math.ceil(totalM / 3000));
  for (const f of linhasF) {
    const amostras = amostrar(f.coords, passo);
    const peso = amostras.length > 1 ? comprimentoM(f.coords) / amostras.length : 0;
    for (const a of amostras) registrar(a, peso, "linha");
  }
  // Polígonos: só dizem em que município(s) estão (a extensão considera apenas os trechos).
  for (const f of poligonosF) {
    const jaContado = new Set<string>();
    for (const a of amostrar(f.coords, passo)) registrar(a, 0, "poligono", jaContado);
  }

  const totalKmMun = [...porMun.values()].reduce((s, m) => s + m.extensaoKm, 0);
  const municipiosAtingidos = [...porMun.values()]
    .map((m) => ({ ...m, extensaoKm: Math.round(m.extensaoKm * 100) / 100, percentual: totalKmMun > 0 ? Math.round((m.extensaoKm / totalKmMun) * 1000) / 10 : 0 }))
    .sort((a, b) => b.extensaoKm - a.extensaoKm || b.pontos - a.pontos);

  if (feicoes.length > 0 && municipiosAtingidos.length === 0) {
    alertas.push({ nivel: "aviso", texto: "Nenhuma parte do KML caiu dentro de um município do Piauí." });
  } else if (semMunicipio > 0 && fora.length === 0) {
    alertas.push({ nivel: "aviso", texto: `${semMunicipio} ponto(s) de amostra ficaram fora dos limites dos municípios do Piauí (perto da divisa ou imprecisão do desenho).` });
  }
  if (municipiosAtingidos.length > 1) {
    alertas.push({ nivel: "info", texto: `O KML passa por ${municipiosAtingidos.length} municípios: ${municipiosAtingidos.map((m) => m.nome).join(", ")}.` });
  }

  // Trechos pequenos, duplicados, desconexos
  const curtos = linhas.filter((l) => l.km < 0.01);
  if (curtos.length > 0) alertas.push({ nivel: "aviso", texto: `${curtos.length} trecho(s) com menos de 10 m: ${curtos.slice(0, 3).map((l) => l.nome).join("; ")}${curtos.length > 3 ? "…" : ""}.` });
  const umVertice = linhasF.filter((f) => f.coords.length < 2).length;
  if (umVertice > 0) alertas.push({ nivel: "aviso", texto: `${umVertice} trecho(s) com um único ponto.` });

  const vistos = new Map<string, number>();
  for (const f of pontosF) {
    const k = `${f.coords[0][0].toFixed(5)},${f.coords[0][1].toFixed(5)}`;
    vistos.set(k, (vistos.get(k) ?? 0) + 1);
  }
  const pontosRepetidos = [...vistos.values()].filter((v) => v > 1).length;
  if (pontosRepetidos > 0) alertas.push({ nivel: "aviso", texto: `${pontosRepetidos} localização(ões) com mais de um ponto no mesmo lugar (pontos repetidos).` });

  const assinaturas = new Map<string, number>();
  for (const f of linhasF) {
    const c = f.coords;
    const a = `${c[0][0].toFixed(5)},${c[0][1].toFixed(5)}`;
    const b = `${c[c.length - 1][0].toFixed(5)},${c[c.length - 1][1].toFixed(5)}`;
    const k = [a, b].sort().join("|") + `|${Math.round(comprimentoM(c))}`;
    assinaturas.set(k, (assinaturas.get(k) ?? 0) + 1);
  }
  const linhasRepetidas = [...assinaturas.values()].filter((v) => v > 1).length;
  if (linhasRepetidas > 0) alertas.push({ nivel: "aviso", texto: `${linhasRepetidas} trecho(s) aparecem duplicados no mesmo KML (mesmo início, fim e extensão).` });

  // Grupos de trechos ligados (pontas a menos de 30 m)
  let grupos = 0;
  if (linhasF.length > 0 && linhasF.length <= 500) {
    const pai = linhasF.map((_, i) => i);
    const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
    const pontas = linhasF.map((f) => [f.coords[0], f.coords[f.coords.length - 1]]);
    for (let i = 0; i < linhasF.length; i++)
      for (let j = i + 1; j < linhasF.length; j++)
        if (pontas[i].some((a) => pontas[j].some((b) => distanciaM(a, b) < 30))) pai[raiz(i)] = raiz(j);
    grupos = new Set(linhasF.map((_, i) => raiz(i))).size;
    if (grupos > 1) alertas.push({ nivel: "info", texto: `Os ${linhasF.length} trechos formam ${grupos} grupos sem ligação entre si (pontas a mais de 30 m umas das outras).` });
  }

  // Comparação com o nome da ação
  let comparacao: ResultadoKml["nomeAcao"] = null;
  if (nomeAcao) {
    const extNome = extensaoNoNome(nomeAcao);
    const munNome = municipiosNoNome(nomeAcao, municipios);
    comparacao = { extensaoKm: extNome, municipios: munNome };
    if (extNome !== null && extensaoKm > 0) {
      const dif = Math.abs(extensaoKm - extNome) / extNome;
      if (dif > 0.25) {
        alertas.push({
          nivel: "aviso",
          texto: `O nome da ação fala em ${extNome.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km, mas os trechos do KML somam ${extensaoKm.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km (${Math.round(dif * 100)}% de diferença).`,
        });
      } else {
        alertas.push({ nivel: "info", texto: `Extensão confere com o nome da ação (${extNome.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km no nome, ${extensaoKm.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km no KML).` });
      }
    } else if (extNome !== null && extensaoKm === 0) {
      alertas.push({ nivel: "info", texto: "O nome da ação cita uma extensão, mas o KML não tem trechos (só pontos ou polígonos) para comparar." });
    }
    if (munNome.length > 0 && municipiosAtingidos.length > 0) {
      const atingidos = new Set(municipiosAtingidos.map((m) => semAcento(m.nome)));
      const naoAtingidos = munNome.filter((m) => !atingidos.has(semAcento(m)));
      if (naoAtingidos.length === munNome.length) {
        alertas.push({ nivel: "erro", texto: `O nome da ação cita ${munNome.join(", ")}, mas o KML está em ${municipiosAtingidos.map((m) => m.nome).join(", ")}.` });
      } else if (naoAtingidos.length > 0) {
        alertas.push({ nivel: "aviso", texto: `O nome da ação cita ${naoAtingidos.join(", ")}, mas o KML não passa por lá.` });
      } else {
        alertas.push({ nivel: "info", texto: `Município confere com o nome da ação (${munNome.join(", ")}).` });
      }
    }
  }

  if (!alertas.some((a) => a.nivel === "erro" || a.nivel === "aviso") && feicoes.length > 0) {
    alertas.unshift({ nivel: "info", texto: "Nenhum problema encontrado nas conferências automáticas." });
  }

  const resultadoFinal: ResultadoKml = {
    arquivo,
    nomeDocumento,
    contagem: { feicoes: feicoes.length, pontos: pontosF.length, linhas: linhasF.length, poligonos: poligonosF.length, pastas, vertices },
    extensaoKm: Math.round(extensaoKm * 1000) / 1000,
    areaHa: Math.round(area * 100) / 100,
    linhas: linhas.sort((a, b) => b.km - a.km).slice(0, 50).map((l) => ({ ...l, km: Math.round(l.km * 1000) / 1000 })),
    pontos: pontosSaida.slice(0, 200),
    caixa,
    centro,
    municipios: municipiosAtingidos,
    foraDoPiaui: fora.length,
    bairros: [...porBairro.values()].sort((a, b) => b.amostras - a.amostras).slice(0, 30),
    gruposDeTrechos: grupos,
    alertas,
    nomeAcao: comparacao,
    mapa: {
      linhas: linhasF.slice(0, 300).map((f) => simplificar(f.coords)),
      poligonos: poligonosF.slice(0, 100).map((f) => simplificar(f.coords)),
      pontos: pontosF.slice(0, 500).map((f) => ({ nome: f.nome, lat: f.coords[0][1], lon: f.coords[0][0] })),
    },
  };
  linhasBrutas.set(resultadoFinal, linhasF.map((f) => f.coords));
  return resultadoFinal;
}

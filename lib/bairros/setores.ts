type Coord = [number, number]; // [lon, lat]

// Setores censitários do IBGE (Censo 2022) com a situação oficial: U = urbano, R = rural.
// Arquivo reduzido a partir do "piaui_data.js" do mapa de impacto (só contorno, município e U/R).
export type Zona = "U" | "R";
export type Setor = { s: Zona | ""; m: string; b: [number, number, number, number]; g: number[][][] };

const CELULA = 0.05; // ~5,5 km

export type IndiceSetores = {
  setores: Setor[];
  /** Zona do ponto: U, R, ou null quando o ponto não cai em nenhum setor (ou o setor não tem classificação). */
  zonaDe: (p: Coord) => Zona | null;
  /** Índice do setor que contém o ponto (ou -1). */
  setorDe: (p: Coord) => number;
};

let cache: IndiceSetores | null = null;

function dentroDoAnel(p: Coord, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDoSetor(p: Coord, z: Setor): boolean {
  if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) return false;
  if (!dentroDoAnel(p, z.g[0])) return false;
  for (let k = 1; k < z.g.length; k++) if (dentroDoAnel(p, z.g[k])) return false;
  return true;
}

export async function carregarSetores(): Promise<IndiceSetores> {
  if (cache) return cache;
  const setores = (await import("@/data/geo/setores_pi.json")).default as unknown as Setor[];

  // Grade: cada célula guarda os setores cuja caixa passa por ela.
  const grade = new Map<string, number[]>();
  const chave = (cx: number, cy: number) => `${cx}:${cy}`;
  setores.forEach((z, i) => {
    for (let cx = Math.floor(z.b[0] / CELULA); cx <= Math.floor(z.b[2] / CELULA); cx++) {
      for (let cy = Math.floor(z.b[1] / CELULA); cy <= Math.floor(z.b[3] / CELULA); cy++) {
        const k = chave(cx, cy);
        const l = grade.get(k);
        if (l) l.push(i);
        else grade.set(k, [i]);
      }
    }
  });

  // Pontos seguidos quase sempre caem no mesmo setor: testa o último achado primeiro.
  let ultimo = -1;
  const setorDe = (p: Coord): number => {
    if (ultimo >= 0 && dentroDoSetor(p, setores[ultimo])) return ultimo;
    const cand = grade.get(chave(Math.floor(p[0] / CELULA), Math.floor(p[1] / CELULA)));
    if (!cand) return -1;
    for (const i of cand) {
      if (i !== ultimo && dentroDoSetor(p, setores[i])) {
        ultimo = i;
        return i;
      }
    }
    return -1;
  };
  const zonaDe = (p: Coord): Zona | null => {
    const i = setorDe(p);
    return i >= 0 && setores[i].s ? (setores[i].s as Zona) : null;
  };
  cache = { setores, zonaDe, setorDe };
  return cache;
}

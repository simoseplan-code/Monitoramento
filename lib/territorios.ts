// Territórios de Desenvolvimento do Piauí (12). Cada município pertence a um território
// (campo "t" de data/geo/municipios_pi.json); o contorno de cada território vem de data/geo/territorios_pi.json
// (gerado por scripts/gerar-territorios.cjs).

export const SEM_TERRITORIO = "(sem localização)";

/** Nome para comparar: sem acento, minúsculo, sem "- PI" no fim. */
export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[-/,]\s*pi\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PEQUENAS = new Set(["de", "do", "da", "dos", "das", "e"]);

/** "VALE DO RIO SAMBITO" -> "Vale do Rio Sambito". */
export function rotuloTerritorio(nome: string): string {
  if (nome === SEM_TERRITORIO) return "Sem localização";
  return nome
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.split("-").map((q) => q.charAt(0).toUpperCase() + q.slice(1)).join("-")))
    .join(" ");
}

export type ParteDoTerritorio = { nome: string; pct: number; metros: number; pontos: number };

/** Cores dos 12 territórios (mapa e legendas). */
export const COR_TERRITORIO: Record<string, string> = {
  CARNAUBAIS: "#2563eb",
  "PLANÍCIE LITORÂNEA": "#0891b2",
  COCAIS: "#16a34a",
  "CHAPADA VALE DO ITAIM": "#65a30d",
  "ENTRE-RIOS": "#9333ea",
  "VALE DO RIO GUARIBAS": "#ea580c",
  "CHAPADA DAS MANGABEIRAS": "#db2777",
  "SERRA DA CAPIVARA": "#ca8a04",
  "TABULEIRO DO ALTO PARNAÍBA": "#4f46e5",
  "VALE DO RIO SAMBITO": "#dc2626",
  "VALE DOS RIOS PIAUÍ E ITAUEIRAS": "#0d9488",
  "VALE DO RIO CANINDÉ": "#7c3aed",
};

/** Cores dos status das ações (mapa de traçados). Status que não está aqui fica cinza. */
export const COR_STATUS: Record<string, string> = {
  "concluido": "#16a34a",
  "em desenvolvimento": "#2563eb",
  "cancelado": "#dc2626",
  "sem evolucao": "#ca8a04",
  "em aberto": "#9333ea",
  "paralisado com termo": "#ea580c",
};

export function corDoStatus(status: string | null | undefined): string {
  const chave = (status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return COR_STATUS[chave] ?? "#6b7280";
}

/** Participação mínima para dizer que a ação "passa" por um território: 0 = qualquer parte do traçado conta, por menor que seja. */
export const PARTICIPACAO_MINIMA = 0;

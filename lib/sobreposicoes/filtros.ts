// Filtros da tela de Sobreposições. Tudo vai na URL (com listas separadas por "|"), então dá para
// copiar o link, abrir em outra aba e a paginação mantém os filtros.

export type FiltrosSobre = {
  /** "analise": fila de análise. "pendencias" e "cgfr": pares com problema, a resolver, por destino. */
  aba: "analise" | "pendencias" | "cgfr";
  status: "pendente" | "ok" | "problema" | "solucionado";
  grupo: "andamento" | "concluidas";
  orgaos: string[];
  statusObras: string[];
  tipologias: string[];
  anos: string[];
  tipologiaTodas: string;
  ocultarEstradaVicinal: boolean;
  pctMin: string;
  pctMax: string;
  busca: string;
};

export type ParamsBrutos = {
  v?: string;
  aba?: string;
  status?: string;
  grupo?: string;
  orgao?: string;
  statusObra?: string;
  tipologia?: string;
  ano?: string;
  tipologiaTodas?: string;
  ocultarEstradaVicinal?: string;
  pctMin?: string;
  pctMax?: string;
  busca?: string;
  pagina?: string;
};

const lista = (v?: string) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean) : []);
const numero = (v?: string) => {
  const n = parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : "";
};

export function lerFiltros(p: ParamsBrutos): FiltrosSobre {
  const aba = p.aba === "pendencias" ? "pendencias" : p.aba === "cgfr" ? "cgfr" : "analise";
  return {
    aba,
    // Nas pendências e no CGFR só existem "com problema" (a resolver) e "solucionado".
    status: aba !== "analise" ? (p.status === "solucionado" ? "solucionado" : "problema") : p.status === "ok" || p.status === "problema" || p.status === "solucionado" ? p.status : "pendente",
    grupo: p.grupo === "concluidas" ? "concluidas" : "andamento",
    orgaos: lista(p.orgao),
    statusObras: lista(p.statusObra),
    tipologias: lista(p.tipologia),
    anos: lista(p.ano).filter((a) => /^\d{4}$/.test(a)),
    tipologiaTodas: p.tipologiaTodas ?? "",
    ocultarEstradaVicinal: p.ocultarEstradaVicinal === "1",
    pctMin: numero(p.pctMin),
    pctMax: numero(p.pctMax),
    busca: (p.busca ?? "").trim().slice(0, 80),
  };
}

/** Parâmetros da URL (só o que foge do padrão). */
export function paramsDe(f: FiltrosSobre): Record<string, string | undefined> {
  return {
    // Marca que a URL já carrega os filtros: o filtro gravado só vale como padrão quando se abre a tela "limpa" pelo menu.
    v: "1",
    aba: f.aba !== "analise" ? f.aba : undefined,
    status: (f.aba !== "analise" ? f.status !== "problema" : f.status !== "pendente") ? f.status : undefined,
    grupo: f.grupo === "concluidas" ? "concluidas" : undefined,
    orgao: f.orgaos.length ? f.orgaos.join("|") : undefined,
    statusObra: f.statusObras.length ? f.statusObras.join("|") : undefined,
    tipologia: f.tipologias.length ? f.tipologias.join("|") : undefined,
    ano: f.anos.length ? f.anos.join("|") : undefined,
    tipologiaTodas: f.tipologiaTodas || undefined,
    ocultarEstradaVicinal: f.ocultarEstradaVicinal ? "1" : undefined,
    pctMin: f.pctMin || undefined,
    pctMax: f.pctMax || undefined,
    busca: f.busca || undefined,
  };
}

export function hrefSobre(f: FiltrosSobre): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsDe(f))) if (v) sp.set(k, v);
  const qs = sp.toString();
  return `/sobreposicoes${qs ? `?${qs}` : ""}`;
}

/** Quantos filtros (além de grupo e status) estão ligados. */
export function qtdFiltrosAtivos(f: FiltrosSobre): number {
  return (
    (f.orgaos.length ? 1 : 0) +
    (f.statusObras.length ? 1 : 0) +
    (f.tipologias.length ? 1 : 0) +
    (f.anos.length ? 1 : 0) +
    (f.tipologiaTodas ? 1 : 0) +
    (f.ocultarEstradaVicinal ? 1 : 0) +
    (f.pctMin ? 1 : 0) +
    (f.pctMax ? 1 : 0) +
    (f.busca ? 1 : 0)
  );
}

/** Destino do par com problema: a aba onde ele está. */
export const destinoDaAba = (aba: FiltrosSobre["aba"]): "pendencias" | "cgfr" => (aba === "cgfr" ? "cgfr" : "pendencias");

// ---------- filtro gravado (um só, vale para todos; mesma tabela filtros_salvos das outras telas) ----------
export const TELA_FILTRO = "sobreposicoes";

export type FiltroGravado = Pick<FiltrosSobre, "orgaos" | "statusObras" | "tipologias" | "anos" | "tipologiaTodas" | "ocultarEstradaVicinal" | "pctMin" | "pctMax" | "busca">;

/** Só os filtros da lateral entram no gravado (aba, status e grupo continuam sendo da navegação). */
export function paraGravar(f: FiltrosSobre): FiltroGravado {
  return {
    orgaos: [...f.orgaos].sort(),
    statusObras: [...f.statusObras].sort(),
    tipologias: [...f.tipologias].sort(),
    anos: [...f.anos].sort(),
    tipologiaTodas: f.tipologiaTodas,
    ocultarEstradaVicinal: f.ocultarEstradaVicinal,
    pctMin: f.pctMin,
    pctMax: f.pctMax,
    busca: f.busca,
  };
}

export function lerGravado(estado: unknown): FiltroGravado | null {
  if (!estado || typeof estado !== "object") return null;
  const e = estado as Record<string, unknown>;
  const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    orgaos: textos(e.orgaos),
    statusObras: textos(e.statusObras),
    tipologias: textos(e.tipologias),
    anos: textos(e.anos),
    tipologiaTodas: typeof e.tipologiaTodas === "string" ? e.tipologiaTodas : "",
    ocultarEstradaVicinal: e.ocultarEstradaVicinal === true,
    pctMin: typeof e.pctMin === "string" ? e.pctMin : "",
    pctMax: typeof e.pctMax === "string" ? e.pctMax : "",
    busca: typeof e.busca === "string" ? e.busca : "",
  };
}

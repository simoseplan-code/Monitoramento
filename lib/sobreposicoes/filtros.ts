// Filtros da tela de Sobreposições. Tudo vai na URL (com listas separadas por "|"), então dá para
// copiar o link, abrir em outra aba e a paginação mantém os filtros.

export type FiltrosSobre = {
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
  return {
    status: p.status === "ok" || p.status === "problema" || p.status === "solucionado" ? p.status : "pendente",
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
    status: f.status !== "pendente" ? f.status : undefined,
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

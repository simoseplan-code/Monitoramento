// Símbolo de cada tipologia no mapa de traçados. A tipologia vem escrita à mão no SIMO, então o símbolo é
// escolhido por palavras-chave (sem acento); o que não bate em nenhuma fica com o pino genérico.
// Desenhos: ícones do lucide (ISC), em lib/tipologiaIconesSvg.ts.
import { ICONES_SVG } from "@/lib/tipologiaIconesSvg";

export type GrupoTipologia = { chave: string; rotulo: string; icone: string };

// A ordem importa: a primeira regra que bate vale (as mais específicas vêm antes).
const REGRAS: { palavras: string[]; grupo: GrupoTipologia }[] = [
  { palavras: ["escola", "educa", "creche", "colegio", "universid", "ensino", "faculdade", "campus"], grupo: { chave: "escola", rotulo: "Escola / educação", icone: "graduation-cap" } },
  { palavras: ["hospital", "saude", "ubs", "upa", "posto de", "clinica", "maternidade"], grupo: { chave: "saude", rotulo: "Saúde", icone: "hospital" } },
  { palavras: ["ponte", "viaduto", "passarela", "bueiro", "galeria"], grupo: { chave: "ponte", rotulo: "Ponte / drenagem", icone: "bridge" } },
  { palavras: ["barragem", "acude", "represa"], grupo: { chave: "barragem", rotulo: "Barragem", icone: "waves-horizontal" } },
  { palavras: ["poco"], grupo: { chave: "poco", rotulo: "Poço", icone: "droplet" } },
  { palavras: ["esgot", "saneamento", "sanitari"], grupo: { chave: "esgoto", rotulo: "Esgoto / saneamento", icone: "toilet" } },
  { palavras: ["abasteciment", "adutora", "agua", "cisterna", "reservatorio", "hidric"], grupo: { chave: "agua", rotulo: "Abastecimento de água", icone: "droplets" } },
  { palavras: ["estrada vicinal", "vicinal"], grupo: { chave: "vicinal", rotulo: "Estrada vicinal", icone: "tractor" } },
  { palavras: ["rodovia", "rua", "avenida", "via ", "vias", "pavimenta", "asfalt", "calcament", "acesso", "estrada", "drenagem"], grupo: { chave: "via", rotulo: "Rua / rodovia", icone: "route" } },
  { palavras: ["praca", "parque", "jardim", "arboriza", "paisagis"], grupo: { chave: "praca", rotulo: "Praça / parque", icone: "trees" } },
  { palavras: ["esporte", "quadra", "ginasio", "estadio", "arena", "lazer", "poliesportivo"], grupo: { chave: "esporte", rotulo: "Esporte e lazer", icone: "dumbbell" } },
  { palavras: ["seguranca", "delegacia", "presidio", "penitenci", "policia", "bombeiro", "detencao", "cadeia"], grupo: { chave: "seguranca", rotulo: "Segurança", icone: "shield" } },
  { palavras: ["habita", "casa", "moradia", "residen", "conjunto"], grupo: { chave: "habitacao", rotulo: "Habitação", icone: "house" } },
  { palavras: ["aeroporto", "aerodromo", "pista de pouso"], grupo: { chave: "aeroporto", rotulo: "Aeroporto", icone: "plane" } },
  { palavras: ["energia", "ilumina", "eletric", "subestacao", "solar"], grupo: { chave: "energia", rotulo: "Energia / iluminação", icone: "zap" } },
  { palavras: ["agro", "rural", "irriga", "agric", "pecuar", "campo", "silo"], grupo: { chave: "agro", rotulo: "Agro / rural", icone: "wheat" } },
  { palavras: ["cultur", "teatro", "museu", "biblioteca", "memorial", "patrimonio", "historic"], grupo: { chave: "cultura", rotulo: "Cultura", icone: "landmark" } },
  { palavras: ["mercado", "feira", "comercio", "abatedouro", "central de abastec"], grupo: { chave: "mercado", rotulo: "Mercado / feira", icone: "store" } },
  { palavras: ["turism", "hotel", "pousada"], grupo: { chave: "turismo", rotulo: "Turismo", icone: "tent" } },
  { palavras: ["igreja", "templo", "capela", "cemiterio"], grupo: { chave: "igreja", rotulo: "Igreja / templo", icone: "church" } },
  { palavras: ["onibus", "terminal", "rodoviaria", "transporte"], grupo: { chave: "transporte", rotulo: "Transporte", icone: "bus" } },
  { palavras: ["industri", "fabrica", "galpao"], grupo: { chave: "industria", rotulo: "Indústria", icone: "factory" } },
  { palavras: ["espaco", "equipament", "unidade", "predio", "sede", "administr", "prefeitura", "forum", "camara", "centro"], grupo: { chave: "equipamento", rotulo: "Prédio / equipamento público", icone: "building-complex" } },
  { palavras: ["cerca", "muro", "contencao"], grupo: { chave: "cerca", rotulo: "Cerca / muro", icone: "fence" } },
  { palavras: ["reform", "ampliac", "obra", "construc"], grupo: { chave: "obra", rotulo: "Obra / reforma", icone: "construction" } },
];

const GENERICO: GrupoTipologia = { chave: "outros", rotulo: "Outras tipologias", icone: "map-pin" };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Símbolo da tipologia (ex.: "UNIDADE ESCOLAR" -> escola). Tipologia vazia ou desconhecida: pino genérico. */
export function grupoDaTipologia(tipologia: string | null | undefined): GrupoTipologia {
  const t = " " + semAcento(tipologia ?? "") + " ";
  for (const r of REGRAS) if (r.palavras.some((p) => t.includes(p))) return r.grupo;
  return GENERICO;
}

/** Desenho do símbolo (dentro de um <svg viewBox="0 0 24 24">). */
export function svgInterno(icone: string): string {
  return ICONES_SVG[icone] ?? ICONES_SVG["map-pin"] ?? "";
}

/** Símbolo pronto para a legenda: SVG colorido. */
export function svgSimbolo(icone: string, cor: string, tamanho = 16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgInterno(icone)}</svg>`;
}

/** Marcador do mapa: bolinha na cor do status com o símbolo da tipologia em branco. */
export function htmlMarcador(icone: string, cor: string, tamanho = 26): string {
  const miolo = Math.round(tamanho * 0.58);
  return `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50%;background:${cor};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${miolo}" height="${miolo}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${svgInterno(icone)}</svg></div>`;
}

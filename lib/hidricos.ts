// Mapa de Recursos Hídricos: só as tipologias de recursos hídricos.
// A tipologia vem escrita à mão no SIMO ("SISTEMA DE ABASTECIMENTO D'ÁGUA", "POÇO"...), então a regra olha as palavras
// (sem acento e sem apóstrofo) em vez do texto exato. Tipologias:
//   Adutora · Barragem · Sistema de Abastecimento de água · Cisterna · Poço · Rede de distribuição de água

const limpar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`´]/g, "")
    .toLowerCase();

export function ehRecursoHidrico(tipologia: string | null | undefined): boolean {
  const t = limpar(tipologia ?? "");
  if (!t) return false;
  if (t.includes("adutora") || t.includes("barragem") || t.includes("cisterna")) return true;
  if (/\bpocos?\b/.test(t)) return true;
  if (t.includes("abastecimento") && t.includes("agua")) return true;
  if (t.includes("distribuicao") && t.includes("agua")) return true;
  return false;
}

export const TIPOLOGIAS_HIDRICAS = ["Adutora", "Barragem", "Sistema de Abastecimento de água", "Cisterna", "Poço", "Rede de distribuição de água"];

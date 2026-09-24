// Motor de sugestão de Unidade de Medida / Quantidade — porta da
// planilha "Sugestão Unidade/Quantidade" (Apps Script) pro app. Lógica
// pura (sem I/O), pra poder rodar tanto no sync (lib/simo/sync.ts)
// quanto em teste isolado. Ver plano em
// C:\Users\tom.morais\.claude\plans\breezy-riding-hickey.md.

// Opções reais do dropdown "Unidade de medida" no SIMO (vistas no HTML
// do formulário). Se o SIMO adicionar/renomear uma opção, atualize aqui.
export const UNIDADES_VALIDAS = ["Dias", "Horas", "Kg", "KM", "KM²", "KM³", "M", "Metros", "M²", "M³", "UNIDADE"];

type Confianca = "alta" | "baixa";

// Mapeamento Tipologia → Unidade esperada. "alta" = regra confirmada
// (dado real da base ou orientação explícita da equipe); "baixa" =
// chute por analogia, sempre mostrado como sugestão de baixa confiança
// pra equipe revisar — nunca aplicado sem aprovação explícita.
export const TIPOLOGIA_UNIDADE_MAP: Record<string, { unidade: string; confianca: Confianca }> = {
  // ── confiança ALTA (tabela de referência da equipe) ──────────────────
  "RUA": { unidade: "M²", confianca: "alta" },
  "AVENIDA": { unidade: "KM", confianca: "alta" },
  "ESTRADA VICINAL": { unidade: "KM", confianca: "alta" },
  "PASSAGEM MOLHADA": { unidade: "UNIDADE", confianca: "alta" },
  "PRAÇA": { unidade: "UNIDADE", confianca: "alta" },
  "QUADRA ESPORTIVA": { unidade: "UNIDADE", confianca: "alta" },
  // ── APRENDIZADOS DA EQUIPE (regras confirmadas na revisão — acrescentar aqui) ──
  // Praça, quadra etc. cadastradas sob essa tipologia são sempre UNIDADE,
  // quantidade 1: o "844,90 M²" do texto é o tamanho da estrutura.
  "ESPAÇO E EQUIPAMENTO DE ESPORTE E LAZER": { unidade: "UNIDADE", confianca: "alta" },
  // ── confiança BAIXA (rascunho por analogia — revisar) ────────────────
  "RODOVIA": { unidade: "KM", confianca: "baixa" },
  "CONTORNO RODOVIÁRIO": { unidade: "KM", confianca: "baixa" },
  "FERROVIA": { unidade: "KM", confianca: "baixa" },
  "CICLOVIAS": { unidade: "KM", confianca: "baixa" },
  "AERÓDROMO": { unidade: "UNIDADE", confianca: "baixa" },
  "AEROPORTO": { unidade: "UNIDADE", confianca: "baixa" },
  "GALPÃO": { unidade: "UNIDADE", confianca: "baixa" },
  "MATADOURO": { unidade: "UNIDADE", confianca: "baixa" },
  "MERCADO PÚBLICO": { unidade: "UNIDADE", confianca: "baixa" },
  "CEMITÉRIO": { unidade: "UNIDADE", confianca: "baixa" },
  "ESTÁDIO": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE ESCOLAR": { unidade: "UNIDADE", confianca: "baixa" },
  "UBS": { unidade: "UNIDADE", confianca: "baixa" },
  "UPA": { unidade: "UNIDADE", confianca: "baixa" },
  "UBAS": { unidade: "UNIDADE", confianca: "baixa" },
  "HOSPITAL REGIONAL": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE ADMINISTRATIVA": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE DE SAÚDE": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE HABITACIONAL": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE POLICIAL": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIDADE PRISIONAL": { unidade: "UNIDADE", confianca: "baixa" },
  "UNIVERSIDADE": { unidade: "UNIDADE", confianca: "baixa" },
  "EQUIPAMENTOS": { unidade: "UNIDADE", confianca: "baixa" },
  "EQUIPAMENTO CULTURAL": { unidade: "UNIDADE", confianca: "baixa" },
  "VEÍCULO": { unidade: "UNIDADE", confianca: "baixa" },
  "CARRO PIPA": { unidade: "UNIDADE", confianca: "baixa" },
  "CISTERNA": { unidade: "UNIDADE", confianca: "baixa" },
  "BARRAGEM": { unidade: "UNIDADE", confianca: "baixa" },
  "AÇUDE": { unidade: "UNIDADE", confianca: "baixa" },
  "POÇO": { unidade: "UNIDADE", confianca: "baixa" },
  "PONTE": { unidade: "UNIDADE", confianca: "baixa" }, // confirmado nos dados reais (UND)
  "VIADUTO/ELEVADO": { unidade: "UNIDADE", confianca: "baixa" },
  "PASSARELA": { unidade: "UNIDADE", confianca: "baixa" },
  "TERMINAL RODOVIÁRIO": { unidade: "UNIDADE", confianca: "baixa" },
  "TERMINAL TURÍSTICO": { unidade: "UNIDADE", confianca: "baixa" },
  "PRÉDIO PÚBLICO": { unidade: "UNIDADE", confianca: "baixa" },
  "CAPACITAÇÃO": { unidade: "", confianca: "baixa" }, // Dias/Horas/Unidade — ambíguo
  "CONSULTORIA": { unidade: "", confianca: "baixa" },
  "ASSISTÊNCIA TÉCNICA": { unidade: "", confianca: "baixa" },
  "SUPERVISÃO": { unidade: "", confianca: "baixa" },
  "FISCALIZAÇÃO": { unidade: "", confianca: "baixa" },
  "ELABORAÇÃO DE PROJETO": { unidade: "", confianca: "baixa" },
  "ADUTORA": { unidade: "", confianca: "baixa" }, // KM ou M — depende da rede
  "DRENAGEM": { unidade: "", confianca: "baixa" },
  "REDE DE DISTRIBUIÇÃO DE AGUA": { unidade: "", confianca: "baixa" },
  "REDE DE ENERGIA ELÉTRICA": { unidade: "", confianca: "baixa" },
  "REDE DE ESGOTO": { unidade: "", confianca: "baixa" },
  "SISTEMA DE ABASTECIMENTO D`ÁGUA": { unidade: "", confianca: "baixa" },
  "SISTEMA DE ESGOTAMENTO SANITÁRIO": { unidade: "", confianca: "baixa" },
};

// Número no formato BR completo: milhar com ponto (0 ou mais grupos de 3
// dígitos) + decimal opcional com vírgula — ex: "1.732,32", "4.938,00",
// "25,28", "9". A ordem das duas alternativas importa: tenta primeiro a
// forma COM separador de milhar (mais específica), senão perderia o "1."
// de "1.732,32".
const NUM_BR = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?)";

// Palavras-chave (regex) → unidade sugerida, aplicadas sobre Nome +
// Descrição da ação. Ordem importa: a primeira que bater define o
// palpite. Quando a regex tem um grupo de captura, ele vira também um
// palpite de Quantidade (ex: "9 Km" → unidade KM, quantidade 9). Tudo
// aqui entra sempre como confiança "baixa" — é só um indício textual,
// nunca aplicado sem revisão.
export const PALAVRAS_CHAVE_UNIDADE: { re: RegExp; unidade: string }[] = [
  { re: new RegExp(NUM_BR + "\\s*km²", "i"), unidade: "KM²" },
  { re: new RegExp(NUM_BR + "\\s*km³", "i"), unidade: "KM³" },
  { re: new RegExp(NUM_BR + "\\s*km\\b", "i"), unidade: "KM" },
  { re: new RegExp(NUM_BR + "\\s*m²", "i"), unidade: "M²" },
  { re: new RegExp(NUM_BR + "\\s*m³", "i"), unidade: "M³" },
  { re: new RegExp(NUM_BR + "\\s*(?:m\\b|metros?\\b)", "i"), unidade: "Metros" },
  { re: new RegExp(NUM_BR + "\\s*(?:kg\\b|quilos?\\b|quilogramas?\\b)", "i"), unidade: "Kg" },
  { re: new RegExp(NUM_BR + "\\s*horas?\\b", "i"), unidade: "Horas" },
  { re: new RegExp(NUM_BR + "\\s*dias?\\b", "i"), unidade: "Dias" },
  { re: new RegExp(NUM_BR + "\\s*(?:unidades?\\b|ve[ií]culos?\\b|equipamentos?\\b|kits?\\b)", "i"), unidade: "UNIDADE" },
  // sem número explícito no texto — só reconhece o TIPO de unidade
  { re: /\bkm²/i, unidade: "KM²" },
  { re: /\bkm³/i, unidade: "KM³" },
  { re: /\bkm\b|quil[oô]metros?\b/i, unidade: "KM" },
  { re: /\bm²|metros?\s+quadrados?\b|\bárea\b/i, unidade: "M²" },
  { re: /\bm³|metros?\s+c[uú]bicos?\b/i, unidade: "M³" },
  { re: /\bmetros?\b/i, unidade: "Metros" },
  { re: /\bkg\b|quilos?\b|quilogramas?\b/i, unidade: "Kg" },
  { re: /\bhoras?\b/i, unidade: "Horas" },
  { re: /\bdias?\b/i, unidade: "Dias" },
  { re: /\bunidades?\b|\bveículos?\b|\bequipamentos?\b|\bkits?\b/i, unidade: "UNIDADE" },
];

// Unidades "vizinhas" que costumam aparecer no texto como rótulo
// abreviado/errado de uma unidade de área/volume esperada pela Tipologia
// (ex: "M" em vez de "M²" — só esqueceram do ²). Uma unidade encontrada
// no texto que NÃO esteja nessa lista (ex: KM pra uma Tipologia M²) é
// diferente demais pra ser só abreviação — é sinal de Tipologia errada.
const UNIDADES_ABREVIACAO_PLAUSIVEL: Record<string, string[]> = {
  "M²": ["Metros"],
  "M³": ["Metros"],
  "KM²": ["KM"],
  "KM³": ["KM"],
};

// Números por extenso comuns em nome/descrição de ação (só até 10, que é
// o que aparece na prática — "construção de DUAS pontes" etc.).
const PALAVRAS_NUMERO_PT: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4,
  cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

export function paraTextoBR(numero: number): string {
  return String(numero).replace(".", ",");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Busca a primeira palavra-chave que bater no texto; devolve a unidade,
// o trecho encontrado (pra mostrar o motivo) e, se houver, a quantidade
// capturada junto (ex: "9 Km" → quantidade "9").
function sugerirUnidadePorTexto(texto: string | null | undefined): { unidade: string; trecho: string; quantidade: string } | null {
  if (!texto) return null;
  for (const regra of PALAVRAS_CHAVE_UNIDADE) {
    const m = texto.match(regra.re);
    // Mantém o número exatamente como apareceu no texto (formato BR:
    // vírgula pra casa decimal, sem separador de milhar) — não converte
    // pra ponto, senão exibe errado (ex: "25,28" virando "25.28").
    if (m) return { unidade: regra.unidade, trecho: m[0].trim(), quantidade: m[1] || "" };
  }
  return null;
}

// Conta quantas estruturas o texto menciona (ex: "duas pontes" → 2, "03
// PONTES" → 3, "3 praças" → 3). Primeiro tenta dígito + o nome da própria
// Tipologia no plural (funciona pra qualquer tipologia, sem precisar
// listar palavra por palavra); depois dígito + "unidades/estruturas";
// depois número por extenso. Sem indício claro, assume 1 — é o caso mais
// comum (uma estrutura só sendo construída/reformada).
function contarUnidadesPorTexto(texto: string, tipologia: string | null | undefined): string {
  if (tipologia) {
    const palavra = escapeRegex(tipologia.trim().toLowerCase());
    if (palavra) {
      const m = texto.match(new RegExp("\\b0*(\\d+)\\s+" + palavra + "s?\\b", "i"));
      if (m) return String(parseInt(m[1], 10));
    }
  }
  const mDigito = texto.match(/\b0*(\d+)\s+(unidades?|estruturas?)\b/i);
  if (mDigito) return String(parseInt(mDigito[1], 10));
  const chave = Object.keys(PALAVRAS_NUMERO_PT).find((p) => new RegExp("\\b" + p + "\\b", "i").test(texto));
  return chave ? String(PALAVRAS_NUMERO_PT[chave]) : "1";
}

export type SugestaoUnidadeInput = {
  nome: string | null | undefined;
  descricao: string | null | undefined;
  tipologia: string | null | undefined;
};

export type SugestaoUnidade = {
  unidadeSugerida: string;
  quantidadeSugerida: string;
  confianca: Confianca;
  motivo: string;
  avisoTipologia?: boolean;
};

// Combina texto (Nome primeiro, Descrição como reforço — é onde a
// informação costuma estar de fato) e Tipologia (via TIPOLOGIA_UNIDADE_MAP)
// pra montar uma sugestão de Unidade/Quantidade com motivo explicado.
// Retorna null quando não há indício nenhum (nem texto, nem tipologia
// mapeada) — nesse caso não há o que sugerir.
export function sugerirUnidadeQuantidade(row: SugestaoUnidadeInput): SugestaoUnidade | null {
  const nome = row.nome || "";
  const descricao = row.descricao || "";
  const tipologia = (row.tipologia || "").trim().toUpperCase();

  let porTexto = sugerirUnidadePorTexto(nome);
  let origemTexto = "Nome";
  if (!porTexto && descricao) {
    porTexto = sugerirUnidadePorTexto(descricao);
    origemTexto = "Descrição";
  }

  const porTipologia = TIPOLOGIA_UNIDADE_MAP[tipologia];

  // Tipologia "UNIDADE" (Praça, Ponte, Passagem Molhada...) — o número
  // que aparece no texto (m², km, metros...) normalmente é o TAMANHO da
  // estrutura, não a quantidade dela.
  if (porTipologia && porTipologia.unidade === "UNIDADE" && porTexto && porTexto.unidade !== "UNIDADE") {
    return {
      unidadeSugerida: "UNIDADE",
      quantidadeSugerida: contarUnidadesPorTexto(nome + " " + descricao, tipologia),
      confianca: porTipologia.confianca,
      motivo:
        'Tipologia "' + tipologia + '" é UNIDADE — "' + porTexto.trecho + '" no ' + origemTexto +
        " é o tamanho da estrutura, não a quantidade dela. Quantidade = contagem de estruturas no texto (padrão 1 se não especificado).",
    };
  }

  // Tipologia de MEDIDA (M², KM...) com confiança ALTA, mas o texto
  // trouxe uma unidade diferente — pode ser só rótulo abreviado (ex: "M"
  // em vez de "M²") ou a unidade errada de verdade (ex: RUA com "KM" —
  // comprimento em vez de área).
  if (
    porTipologia &&
    porTipologia.confianca === "alta" &&
    porTipologia.unidade !== "UNIDADE" &&
    porTexto &&
    porTexto.unidade !== porTipologia.unidade
  ) {
    const abreviacoesPlausiveis = UNIDADES_ABREVIACAO_PLAUSIVEL[porTipologia.unidade] || [];
    const ehAbreviacaoPlausivel = abreviacoesPlausiveis.includes(porTexto.unidade);

    if (!ehAbreviacaoPlausivel) {
      return {
        unidadeSugerida: porTexto.unidade,
        quantidadeSugerida: porTexto.quantidade,
        confianca: "baixa",
        avisoTipologia: true,
        motivo:
          '⚠️ Encontrei "' + porTexto.trecho + '" no ' + origemTexto + ' — mas Tipologia "' + tipologia + '" é sempre ' +
          porTipologia.unidade + ", e " + porTexto.unidade + " não é o mesmo tipo de medida (é comprimento, não área/volume). " +
          "Provavelmente está errado por vir em " + porTexto.unidade + " — sugiro calcular/recalcular o valor em " + porTipologia.unidade +
          " (não dá pra converter automaticamente sem saber a largura/outra dimensão). Confira com atenção antes de aplicar.",
      };
    }

    return {
      unidadeSugerida: porTipologia.unidade,
      quantidadeSugerida: porTexto.quantidade,
      confianca: "alta",
      motivo:
        'Tipologia "' + tipologia + '" é sempre ' + porTipologia.unidade + ' — "' + porTexto.trecho + '" no ' + origemTexto +
        " veio com o rótulo abreviado/errado (" + porTexto.unidade + "). Mantive o número, só corrigi a unidade.",
    };
  }

  if (porTexto && porTipologia && porTipologia.unidade && porTexto.unidade === porTipologia.unidade) {
    return {
      unidadeSugerida: porTexto.unidade,
      quantidadeSugerida: porTexto.quantidade,
      confianca: porTipologia.confianca === "alta" ? "alta" : "baixa",
      motivo:
        'Texto ("' + porTexto.trecho + '" no ' + origemTexto + ') e Tipologia ("' + tipologia + '") concordam em ' +
        porTexto.unidade + ".",
    };
  }

  if (porTexto) {
    let motivo = 'Encontrei "' + porTexto.trecho + '" no ' + origemTexto + " → sugiro " + porTexto.unidade + ".";
    if (porTipologia && porTipologia.unidade && porTipologia.unidade !== porTexto.unidade) {
      motivo += ' ⚠️ Diverge do esperado pra Tipologia "' + tipologia + '" (' + porTipologia.unidade + ") — confira com atenção.";
    }
    return { unidadeSugerida: porTexto.unidade, quantidadeSugerida: porTexto.quantidade, confianca: "baixa", motivo };
  }

  if (porTipologia && porTipologia.unidade) {
    return {
      unidadeSugerida: porTipologia.unidade,
      quantidadeSugerida: "",
      confianca: porTipologia.confianca,
      motivo: 'Nenhuma palavra-chave clara no Nome/Descrição — sugestão baseada só na Tipologia "' + tipologia + '".',
    };
  }

  return null;
}

// Parser do CSV exportado pelo relatório "AUTOMAÇÃO CONTRATO SIAFE" do
// SIMO. Mesma estratégia do Apps Script original: procura a linha de
// cabeçalho pelo NOME das colunas (não pela posição), porque o
// relatório sempre imprime título/subtítulo antes do cabeçalho de
// verdade — e assim, se o SIMO adicionar colunas novas, o parser
// continua funcionando (a coluna nova só não é reconhecida até
// entrarmos no HEADER_MAP abaixo, e cai em "extra").

export const HEADER_MAP: Record<string, string[]> = {
  id_acao: ["ID DA AÇÃO", "ID"],
  nome_acao: ["NOME DA AÇÃO"],
  numero_automatico: ["NÚMERO AUTOMÁTICO", "NUMERO AUTOMATICO"],
  numero_siafe: ["NÚMERO DO CONTRATO NO SIAFE", "NUMERO DO CONTRATO NO SIAFE"],
};

export const HEADER_MAP_OPCIONAL: Record<string, string[]> = {
  orgao: ["ÓRGÃO DA AÇÃO", "ÓRGÃO"],
  status: ["STATUS"],
  data_criacao: ["DATA DE CRIAÇÃO", "DATA DE CRIACAO"],
  estagio_atual: ["ESTÁGIO ATUAL", "ESTAGIO ATUAL"],
  percentual_execucao: ["PERCENTUAL DE EXECUÇÃO DA AÇÃO", "PERCENTUAL DE EXECUCAO DA ACAO"],
  acao_conveniada: ["AÇÃO CONVENIADA", "ACAO CONVENIADA"],
  tipo_outros_documentos: ["TIPO OUTROS DOCUMENTOS", "TIPO OUTROS DOCUMENTO"],
  data_receb_definitivo: ["RECEB. DEFINITIVO", "RECEB DEFINITIVO", "RECEBIMENTO DEFINITIVO", "DATA RECEBIMENTO DEFINITIVO"],
  data_receb_provisorio: ["RECEB. PROVISÓRIO", "RECEB. PROVISORIO", "RECEB PROVISÓRIO", "RECEBIMENTO PROVISÓRIO", "DATA RECEBIMENTO PROVISÓRIO"],
  tipologia: ["TIPOLOGIA"],
  unidade_medida: ["UNIDADE DE MEDIDA"],
  quantidade: ["QUANTIDADE", "QUANTITATIVO"],
  descricao_acao: ["DESCRIÇÃO DA AÇÃO", "DESCRICAO DA AÇÃO", "DESCRIÇÃO"],
};

export type ObraRow = {
  id_acao: string;
  nome_acao: string;
  numero_automatico: string | null;
  numero_siafe: string | null;
  orgao: string | null;
  status: string | null;
  data_criacao: string | null;
  estagio_atual: string | null;
  percentual_execucao: number | null;
  acao_conveniada: string | null;
  tipo_outros_documentos: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  tipologia: string | null;
  unidade_medida: string | null;
  quantidade: number | null;
  descricao_acao: string | null;
  extra: Record<string, string>;
};

// Parser de CSV simples com separador ";" que respeita aspas.
// Exportado porque outros importadores (ex.: lib/sobreposicoes/parseCsv.ts)
// usam o mesmo formato de CSV e não precisam reimplementar isso.
export function parseCsvLinhas(texto: string): string[][] {
  const linhas: string[][] = [];
  let linhaAtual: string[] = [];
  let campoAtual = "";
  let dentroAspas = false;

  const texto2 = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < texto2.length; i++) {
    const c = texto2[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto2[i + 1] === '"') {
          campoAtual += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campoAtual += c;
      }
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ";") {
      linhaAtual.push(campoAtual);
      campoAtual = "";
    } else if (c === "\n") {
      linhaAtual.push(campoAtual);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campoAtual = "";
    } else {
      campoAtual += c;
    }
  }
  if (campoAtual !== "" || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual);
    linhas.push(linhaAtual);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

function contarBatidas(linha: string[]): number {
  const upper = linha.map((v) => v.trim().toUpperCase());
  let batidas = 0;
  for (const candidatos of Object.values(HEADER_MAP)) {
    if (candidatos.some((c) => upper.includes(c.toUpperCase()))) batidas++;
  }
  return batidas;
}

function pctParaFracao(raw: string | undefined): number | null {
  const n = paraNumeroBR(raw?.replace("%", ""));
  return n === null ? null : n / 100;
}

// "1.732,32" (formato BR, texto) -> 1732.32 (número JS de verdade).
// Compartilhada com o motor de sugestão de Unidade/Quantidade
// (lib/unidadeQuantidade/sugestao.ts), que reenvia número nesse mesmo
// formato de volta pro SIMO.
export function paraNumeroBR(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const limpo = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

function dataParaISO(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function vazio(raw: string | undefined): boolean {
  const s = (raw ?? "").trim();
  return s === "" || s === "-";
}

export function csvParaObras(csvText: string): ObraRow[] {
  const linhasCsv = parseCsvLinhas(csvText);
  if (linhasCsv.length === 0) throw new Error("CSV do SIMO veio vazio.");

  const totalCampos = Object.keys(HEADER_MAP).length;
  let melhorIdx = -1;
  let melhorBatidas = 0;
  const limite = Math.min(linhasCsv.length, 15);
  for (let i = 0; i < limite; i++) {
    const batidas = contarBatidas(linhasCsv[i]);
    if (batidas > melhorBatidas) {
      melhorBatidas = batidas;
      melhorIdx = i;
    }
  }

  if (melhorIdx === -1 || melhorBatidas < Math.ceil(totalCampos / 2)) {
    throw new Error(
      `Não encontrei uma linha de cabeçalho reconhecível nas primeiras ${limite} linhas do CSV do SIMO.`
    );
  }

  const cabecalho = linhasCsv[melhorIdx].map((h) => h.trim().toUpperCase());
  const posPorCampo: Record<string, number> = {};
  const faltando: string[] = [];

  for (const [campo, candidatos] of Object.entries(HEADER_MAP)) {
    const pos = cabecalho.findIndex((h) => candidatos.map((c) => c.toUpperCase()).includes(h));
    if (pos === -1) faltando.push(campo);
    else posPorCampo[campo] = pos;
  }
  if (faltando.length > 0) {
    throw new Error(`Cabeçalho do SIMO sem as colunas obrigatórias: ${faltando.join(", ")}.`);
  }

  for (const [campo, candidatos] of Object.entries(HEADER_MAP_OPCIONAL)) {
    const pos = cabecalho.findIndex((h) => candidatos.map((c) => c.toUpperCase()).includes(h));
    if (pos !== -1) posPorCampo[campo] = pos;
  }

  // Datas de recebimento: se o nome exato não bateu, procura pelo sentido
  // (sem acento): RECEB... + DEFINIT... / PROVIS... — o cabeçalho no arquivo
  // pode vir como "RECEBIMENTO DEFINITIVO", "RECEB DEFINITIVO" etc.
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const acharPorSentido = (parte: string) =>
    cabecalho.findIndex((h) => {
      const n = semAcento(h);
      return n.includes("RECEB") && n.includes(parte);
    });
  if (posPorCampo.data_receb_definitivo === undefined) {
    const p = acharPorSentido("DEFINIT");
    if (p !== -1) posPorCampo.data_receb_definitivo = p;
  }
  if (posPorCampo.data_receb_provisorio === undefined) {
    const p = acharPorSentido("PROVIS");
    if (p !== -1) posPorCampo.data_receb_provisorio = p;
  }

  // Colunas do CSV que não caíram em nenhum campo conhecido acima —
  // guardadas em "extra" pra não perder dado se o SIMO adicionar coluna nova.
  const posConhecidas = new Set(Object.values(posPorCampo));
  const colunasExtras = cabecalho
    .map((nome, idx) => ({ nome, idx }))
    .filter(({ idx }) => !posConhecidas.has(idx) && cabecalho[idx] !== "");

  const linhasDados = linhasCsv.slice(melhorIdx + 1);
  const obras: ObraRow[] = [];

  for (const linha of linhasDados) {
    const get = (campo: string) => linha[posPorCampo[campo]];
    const idAcao = get("id_acao")?.trim();
    if (!idAcao) continue;

    const extra: Record<string, string> = {};
    for (const { nome, idx } of colunasExtras) {
      const valor = linha[idx];
      if (valor !== undefined && valor.trim() !== "") extra[nome] = valor.trim();
    }

    obras.push({
      id_acao: idAcao,
      nome_acao: get("nome_acao")?.trim() ?? "",
      numero_automatico: vazio(get("numero_automatico")) ? null : get("numero_automatico").trim(),
      numero_siafe: vazio(get("numero_siafe")) ? null : get("numero_siafe").trim(),
      orgao: get("orgao")?.trim() || null,
      status: get("status")?.trim() || null,
      data_criacao: dataParaISO(get("data_criacao")),
      estagio_atual: get("estagio_atual")?.trim() || null,
      percentual_execucao: pctParaFracao(get("percentual_execucao")),
      acao_conveniada: get("acao_conveniada")?.trim() || null,
      tipo_outros_documentos: get("tipo_outros_documentos")?.trim() || null,
      // "-" (sem data) não casa com dd/mm/aaaa e vira null.
      data_receb_definitivo: dataParaISO(get("data_receb_definitivo")),
      data_receb_provisorio: dataParaISO(get("data_receb_provisorio")),
      tipologia: get("tipologia")?.trim() || null,
      unidade_medida: vazio(get("unidade_medida")) ? null : get("unidade_medida").trim(),
      quantidade: paraNumeroBR(get("quantidade")),
      descricao_acao: get("descricao_acao")?.trim() || null,
      extra,
    });
  }

  return obras;
}

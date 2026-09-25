// Parser do CSV de sobreposições exportado pelo Mapa de Obras (painel
// separado, ferramenta de detecção geométrica de trechos duplicados).
// Formato "longo": uma linha por obra dentro de cada local, com a
// coluna "Chave do Local" repetida nas linhas do mesmo grupo — aqui a
// gente desfaz isso e agrupa de volta em um objeto por local.

import { parseCsvLinhas } from "@/lib/simo/parseCsv";

export type ObraNoLocal = {
  id: string | null;
  nome: string;
  orgao: string | null;
  status: string | null;
  contrato: string | null;
  // Preenchido só na tela (base sincronizada): SIAFE digitado que ainda não
  // virou contrato vinculado (sem número automático).
  siafe_nao_vinculado?: string | null;
  // Também só na tela (base sincronizada): percentual de execução (0 a 1) e
  // data em que a ação foi concluída (recebimento definitivo, ou o
  // provisório quando ainda não há definitivo).
  percentual?: number | null;
  concluido_em?: string | null;
};

export type SobreposicaoImportada = {
  chave_local: string;
  obras: ObraNoLocal[];
  qtd_obras: number;
  extensao_m: number | null;
  tolerancia_m: number | null;
  qtd_segmentos: number | null;
  lat_inicio: number | null;
  lon_inicio: number | null;
  lat_fim: number | null;
  lon_fim: number | null;
};

const COLUNAS_OBRIGATORIAS = ["Chave do Local", "ID da Ação", "Nome da Ação"];

function numeroOuNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function inteiroOuNull(raw: string | undefined): number | null {
  const n = numeroOuNull(raw);
  return n === null ? null : Math.round(n);
}

export function csvParaSobreposicoes(csvText: string): SobreposicaoImportada[] {
  const linhasCsv = parseCsvLinhas(csvText);
  if (linhasCsv.length === 0) throw new Error("CSV de sobreposições veio vazio.");

  const cabecalho = linhasCsv[0].map((h) => h.trim());
  const pos = (nome: string) => cabecalho.indexOf(nome);

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => pos(c) === -1);
  if (faltando.length > 0) {
    throw new Error(
      `CSV sem as colunas obrigatórias: ${faltando.join(", ")}. Exporte de novo pelo Mapa de Obras (aba Sobreposição de Trechos).`
    );
  }

  const idx = {
    chave: pos("Chave do Local"),
    qtdObras: pos("Qtd. obras no local"),
    idAcao: pos("ID da Ação"),
    nomeAcao: pos("Nome da Ação"),
    orgao: pos("Orgão da Açao"),
    status: pos("Status"),
    contrato: pos("Número do Contrato no SIAFE"),
    extensao: pos("Extensão sobreposta (m)"),
    tolerancia: pos("Tolerância usada (m)"),
    qtdSegmentos: pos("Qtd. segmentos sobrepostos"),
    latInicio: pos("Latitude Início"),
    lonInicio: pos("Longitude Início"),
    latFim: pos("Latitude Fim"),
    lonFim: pos("Longitude Fim"),
  };

  const porChave = new Map<string, SobreposicaoImportada>();

  for (const linha of linhasCsv.slice(1)) {
    const chave = linha[idx.chave]?.trim();
    const nomeAcao = linha[idx.nomeAcao]?.trim();
    if (!chave || !nomeAcao) continue;

    let grupo = porChave.get(chave);
    if (!grupo) {
      grupo = {
        chave_local: chave,
        obras: [],
        qtd_obras: inteiroOuNull(linha[idx.qtdObras]) ?? 0,
        extensao_m: numeroOuNull(linha[idx.extensao]),
        tolerancia_m: inteiroOuNull(linha[idx.tolerancia]),
        qtd_segmentos: inteiroOuNull(linha[idx.qtdSegmentos]),
        lat_inicio: numeroOuNull(linha[idx.latInicio]),
        lon_inicio: numeroOuNull(linha[idx.lonInicio]),
        lat_fim: numeroOuNull(linha[idx.latFim]),
        lon_fim: numeroOuNull(linha[idx.lonFim]),
      };
      porChave.set(chave, grupo);
    }

    const idAcao = linha[idx.idAcao]?.trim() || null;
    // Defesa contra CSV com linha duplicada pra mesma obra no mesmo local (ex.: uma
    // exportação antiga do mapa, de antes da chave do local incluir a coordenada) —
    // sem isso a mesma obra aparecia repetida várias vezes dentro de um único card.
    const jaTem = grupo.obras.some((o) => (idAcao ? o.id === idAcao : o.nome === nomeAcao));
    if (jaTem) continue;

    grupo.obras.push({
      id: idAcao,
      nome: nomeAcao,
      orgao: linha[idx.orgao]?.trim() || null,
      status: linha[idx.status]?.trim() || null,
      contrato: linha[idx.contrato]?.trim() || null,
    });
  }

  return Array.from(porChave.values());
}

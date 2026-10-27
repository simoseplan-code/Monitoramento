import ExcelJS from "exceljs";
import type { RelatorioMontado } from "@/lib/analiseConcluidasDados";

// Excel da Análise de obras concluídas: só o relatório principal (filtros usados, tabela por ano,
// quantitativos e órgãos), numa aba. Os números ficam como número (dá para somar, filtrar e fazer gráficos).

const AZUL = "FF7F8FB0";
const AZUL_ESCURO = "FF1F2A44";
const CINZA = "FFF1F2F5";
const BORDA = { style: "thin" as const, color: { argb: "FFD9DBE1" } };
const DINHEIRO = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function cabecalho(linha: ExcelJS.Row, preenchimento = AZUL) {
  linha.height = 32;
  linha.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: preenchimento } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
  });
}

function titulo(ws: ExcelJS.Worksheet, texto: string, subtitulo: string, colunas: number) {
  ws.mergeCells(1, 1, 1, colunas);
  const t = ws.getCell(1, 1);
  t.value = texto;
  t.font = { bold: true, size: 15, color: { argb: AZUL_ESCURO } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, colunas);
  const s = ws.getCell(2, 1);
  s.value = subtitulo;
  s.font = { size: 9, color: { argb: "FF6B6A66" } };
}

export async function gerarExcelAnalise(r: RelatorioMontado, geradoPor: string, geradoEm: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monitoramento de Obras";
  wb.created = new Date();

  // ───────── Resumo ─────────
  const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 18 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 24 }];
  titulo(ws, "Análise de obras concluídas", `Gerado em ${geradoEm} por ${geradoPor} · ${r.filtradas.length.toLocaleString("pt-BR")} obra(s) de ${r.totalNaBase.toLocaleString("pt-BR")} com recebimento`, 8);

  // Filtros aplicados
  let linha = 4;
  ws.mergeCells(linha, 1, linha, 8);
  ws.getCell(linha, 1).value = "Filtros aplicados";
  ws.getCell(linha, 1).font = { bold: true, size: 11, color: { argb: AZUL_ESCURO } };
  linha++;
  for (const f of r.filtros) {
    ws.mergeCells(linha, 1, linha, 8);
    ws.getCell(linha, 1).value = "• " + f;
    ws.getCell(linha, 1).font = { size: 9, color: { argb: "FF52514E" } };
    linha++;
  }
  linha++;

  // Tabela por ano
  ws.mergeCells(linha, 1, linha, 8);
  ws.getCell(linha, 1).value = "Valores calculados em cima de obras concluídas";
  ws.getCell(linha, 1).font = { bold: true, size: 11, color: { argb: AZUL_ESCURO } };
  linha++;
  const cab = ws.getRow(linha);
  ["Ano recebimento", "Valor total contratado", "Quantidade de obras analisadas", "Quantidade de obras aditivadas", "Valor total ao final da obra", "% sob quant.", "% sob valor", "Valor aditivado"].forEach((t, i) => (cab.getCell(i + 1).value = t));
  cabecalho(cab);
  linha++;
  const escreve = (l: (typeof r.tabela.geral), ehTotal: boolean) => {
    const row = ws.getRow(linha++);
    row.values = [ehTotal ? "Total geral" : l.ano, l.original, l.qtd, l.aditivadas, l.total, l.pctQuant, l.pctValor, l.aditivo];
    row.eachCell((c, n) => {
      c.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
      c.alignment = { vertical: "middle", horizontal: n === 1 ? "left" : "right" };
      if (n === 2 || n === 5 || n === 8) c.numFmt = DINHEIRO;
      if (n === 3 || n === 4) c.numFmt = "#,##0";
      if (n === 6 || n === 7) c.numFmt = "0.00%";
      if (ehTotal) {
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
        c.border = { top: { style: "medium", color: { argb: AZUL_ESCURO } }, bottom: BORDA, left: BORDA, right: BORDA };
      }
    });
    row.height = 20;
  };
  for (const l of r.tabela.linhas) escreve(l, false);
  escreve(r.tabela.geral, true);
  linha++;

  // Quantitativos
  ws.mergeCells(linha, 1, linha, 8);
  ws.getCell(linha, 1).value = "Quantitativos gerais";
  ws.getCell(linha, 1).font = { bold: true, size: 11, color: { argb: AZUL_ESCURO } };
  linha++;
  const q = r.q;
  const itens: [string, number | string, string?][] = [
    ["Obras analisadas", q.obras, "#,##0"],
    ["Com valor informado", q.comValor, "#,##0"],
    ["Sem valor original", q.semValor, "#,##0"],
    ["Recebimento definitivo", q.definitivo, "#,##0"],
    ["Só recebimento provisório", q.soProvisorio, "#,##0"],
    ["Com aditivo (valor total maior que o original)", q.aditivadas, "#,##0"],
    ["Sem aditivo", q.semAditivo, "#,##0"],
    ["Com supressão (valor total menor que o original)", q.suprimidas, "#,##0"],
    ["Valor médio contratado", q.ticketMedio, DINHEIRO],
    ["Aditivo médio (obras aditivadas)", q.aditivoMedioPorAditivada, DINHEIRO],
    ["Datas de recebimento suspeitas (ano fora do normal)", q.datasSuspeitas, "#,##0"],
  ];
  for (const [rotulo, valor, fmt] of itens) {
    ws.mergeCells(linha, 1, linha, 4);
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { size: 10 };
    const c = ws.getCell(linha, 5);
    c.value = valor as number;
    if (fmt) c.numFmt = fmt;
    c.font = { bold: true };
    c.alignment = { horizontal: "right" };
    for (let n = 1; n <= 5; n++) ws.getCell(linha, n).border = { bottom: BORDA };
    linha++;
  }
  if (q.maiorAditivo) {
    ws.mergeCells(linha, 1, linha, 4);
    ws.getCell(linha, 1).value = `Maior aditivo: ação ${q.maiorAditivo.id}`;
    const c = ws.getCell(linha, 5);
    c.value = q.maiorAditivo.valor;
    c.numFmt = DINHEIRO;
    c.font = { bold: true };
    linha++;
  }

  // Por órgão (na mesma aba)
  linha++;
  ws.mergeCells(linha, 1, linha, 8);
  ws.getCell(linha, 1).value = "Por órgão";
  ws.getCell(linha, 1).font = { bold: true, size: 11, color: { argb: AZUL_ESCURO } };
  linha++;
  const cabO = ws.getRow(linha);
  ws.mergeCells(linha, 1, linha, 2);
  ws.mergeCells(linha, 6, linha, 8);
  cabO.getCell(1).value = "Órgão";
  cabO.getCell(3).value = "Obras";
  cabO.getCell(4).value = "Aditivadas";
  cabO.getCell(5).value = "Valor contratado";
  cabO.getCell(6).value = "Valor aditivado";
  cabecalho(cabO);
  linha++;
  for (const o of r.q.porOrgao) {
    ws.mergeCells(linha, 1, linha, 2);
    ws.mergeCells(linha, 6, linha, 8);
    const row = ws.getRow(linha);
    row.getCell(1).value = o.orgao;
    row.getCell(3).value = o.qtd;
    row.getCell(3).numFmt = "#,##0";
    row.getCell(4).value = o.aditivadas;
    row.getCell(4).numFmt = "#,##0";
    row.getCell(5).value = o.original;
    row.getCell(5).numFmt = DINHEIRO;
    row.getCell(6).value = o.aditivo;
    row.getCell(6).numFmt = DINHEIRO;
    for (let n = 1; n <= 8; n++) ws.getCell(linha, n).border = { bottom: BORDA };
    for (const n of [3, 4, 5, 6]) row.getCell(n).alignment = { horizontal: "right" };
    linha++;
  }

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  const dados = await wb.xlsx.writeBuffer();
  return Buffer.from(dados as ArrayBuffer);
}

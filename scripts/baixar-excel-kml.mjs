// Baixa o "Excel dos KML" (mesmo arquivo do botão da tela Análise geral) e salva numa pasta.
// Feito para rodar todo dia de madrugada pelo Agendador de Tarefas do Windows (ver agendar-excel-kml.ps1).
//
// Variáveis de ambiente:
//   CRON_SECRET        (obrigatória) o mesmo segredo dos cron jobs da Vercel
//   MONITORAMENTO_URL  (opcional) padrão https://monitoramento-eight.vercel.app
//   DESTINO            (opcional) padrão C:\Users\tom.morais\Nextcloud\DIMA
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_BASE = (process.env.MONITORAMENTO_URL || "https://monitoramento-eight.vercel.app").replace(/\/$/, "");
const SEGREDO = process.env.CRON_SECRET;
// O arquivo de destino pode vir com caracteres invisíveis (BOM) na frente: começa a partir da letra do disco.
const destinoBruto = (process.env.DESTINO || "").trim();
const DESTINO = (destinoBruto.match(/[A-Za-z]:\\.*$/) || [])[0] || "C:\\Users\\tom.morais\\Nextcloud\\DIMA";
if (!SEGREDO) {
  console.error("Falta a variável CRON_SECRET.");
  process.exit(1);
}

const linhas = [];
const sem = [];
const info = new Map();
let apos = "";
let total = 0;
let feitos = 0;
for (;;) {
  let json = null;
  for (let tentativa = 0; tentativa < 4 && !json; tentativa++) {
    try {
      const resp = await fetch(`${URL_BASE}/api/territorios/kml-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SEGREDO}` },
        body: JSON.stringify({ todos: true, apos }),
      });
      const j = await resp.json().catch(() => null);
      if (resp.ok && Array.isArray(j?.linhas)) json = j;
      else console.error(`Tentativa ${tentativa + 1}: resposta ${resp.status} ${j?.error ?? ""}`);
    } catch (e) {
      console.error(`Tentativa ${tentativa + 1}: ${e.message}`);
    }
    if (!json) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!json) {
    console.error("Não consegui ler os KML. Nada foi salvo.");
    process.exit(1);
  }
  linhas.push(...json.linhas);
  sem.push(...(json.sem ?? []));
  for (const [k, v] of Object.entries(json.info ?? {})) info.set(k, v);
  if (typeof json.total === "number") total = json.total;
  feitos += new Set(json.linhas.map((l) => l.id)).size + (json.sem ?? []).length;
  if (feitos % 240 < 12) console.log(`Lendo KML ${Math.min(feitos, total)}/${total}`);
  if (!json.proximo) break;
  apos = json.proximo;
}

const wb = new ExcelJS.Workbook();
wb.creator = "Monitoramento de Obras";
const cab = (ws, titulos) => {
  const row = ws.getRow(1);
  titulos.forEach((t, k) => (row.getCell(k + 1).value = t));
  row.height = 28;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7F8FB0" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: titulos.length } };
};
const ws = wb.addWorksheet("Dados do KML");
ws.columns = [{ width: 10 }, { width: 50 }, { width: 22 }, { width: 24 }, { width: 22 }, { width: 28 }, { width: 22 }, { width: 38 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 24 }];
cab(ws, ["ID SIMO", "Nome da ação", "Órgão", "Tipologia", "Município", "Bairro", "Zona", "Nome da geometria", "Tipo da geometria", "Trecho no bairro (km)", "Extensão da geometria (km)", "Pasta do KML"]);
linhas.sort((a, b) => Number(a.id) - Number(b.id));
linhas.forEach((l, k) => {
  const a = info.get(l.id);
  const row = ws.getRow(k + 2);
  row.values = [Number(l.id), a?.nome ?? "", a?.orgao ?? "", a?.tipologia ?? "", l.municipio, l.bairro, l.zona, l.geometria, l.tipo, l.km, l.kmTotal, l.pasta];
  row.getCell(10).numFmt = "#,##0.000";
  row.getCell(11).numFmt = "#,##0.000";
});
const ws2 = wb.addWorksheet("Sem KML");
ws2.columns = [{ width: 10 }, { width: 50 }, { width: 22 }, { width: 24 }, { width: 50 }];
cab(ws2, ["ID SIMO", "Nome da ação", "Órgão", "Tipologia", "Motivo"]);
sem.sort((a, b) => Number(a.id) - Number(b.id));
sem.forEach((l, k) => {
  const a = info.get(l.id);
  ws2.getRow(k + 2).values = [Number(l.id), a?.nome ?? "", a?.orgao ?? "", a?.tipologia ?? "", l.motivo];
});

mkdirSync(DESTINO, { recursive: true });
const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
const arquivo = join(DESTINO, `dados-kml-${dia}.xlsx`);
writeFileSync(arquivo, Buffer.from(await wb.xlsx.writeBuffer()));
console.log(`Salvo: ${arquivo} (${linhas.length} linhas, ${new Set(linhas.map((l) => l.id)).size} ações com KML, ${sem.length} sem KML)`);

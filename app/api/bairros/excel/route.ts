import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlAcaoSimo } from "@/components/IdAcaoLink";

export const runtime = "nodejs";
export const maxDuration = 60;

const AZUL = "FF7F8FB0";
const AZUL_ESCURO = "FF1F2A44";
const BORDA = { style: "thin" as const, color: { argb: "FFD9DBE1" } };
const porcento = (v: number) => `${Math.round(v * 100)}%`;

type Linha = {
  id_acao: string;
  fonte: string;
  extensao_m: number;
  metros_fora: number;
  pontos_fora: number | null;
  municipio: string | null;
  bairro: string | null;
  metros: number | null;
  pct: number | null;
  pontos: number | null;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
};

const ORIGEM: Record<string, string> = { sobreposicoes: "Linhas do mapa", kml: "KML guardado", mapa: "Pontos ou polígonos do mapa" };

function cabecalho(ws: ExcelJS.Worksheet, titulos: string[], linha: number) {
  const row = ws.getRow(linha);
  titulos.forEach((t, i) => (row.getCell(i + 1).value = t));
  row.height = 28;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
  });
}

// Excel da Verificação de bairros: as ações que estão na lista filtrada da tela (a tela manda os IDs).
// Equipe aprovada.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("nome, status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { ids?: unknown; filtros?: unknown } | null;
  const ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.filter((i): i is string => typeof i === "string" && /^\d{1,12}$/.test(i)))) : [];
  if (ids.length === 0 || ids.length > 20000) return NextResponse.json({ error: "Nenhuma ação para exportar." }, { status: 400 });
  const filtros = Array.isArray(corpo?.filtros) ? (corpo.filtros as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 20) : [];

  const linhas: Linha[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("acao_bairros_lista").select("*").in("id_acao", ids.slice(i, i + 200));
    if (error) return NextResponse.json({ error: "Não consegui ler os dados." }, { status: 500 });
    linhas.push(...((data ?? []) as Linha[]));
  }
  linhas.sort((a, b) => Number(a.id_acao) - Number(b.id_acao) || (b.metros ?? 0) - (a.metros ?? 0));

  // Data de criação e ano de conclusão (recebimento provisório; se não houver, o definitivo).
  const datas = new Map<string, { criada: string; conclusao: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("obras").select("id_acao, data_criacao, data_receb_definitivo, data_receb_provisorio").in("id_acao", ids.slice(i, i + 200));
    for (const o of data ?? []) {
      const rec = (o.data_receb_provisorio as string | null) || (o.data_receb_definitivo as string | null);
      const c = ((o.data_criacao as string | null) ?? "").slice(0, 10).split("-");
      datas.set(o.id_acao as string, { criada: c.length === 3 ? `${c[2]}/${c[1]}/${c[0]}` : "", conclusao: rec ? rec.slice(0, 4) : "" });
    }
  }

  // Agrupa por ação.
  const porAcao = new Map<string, Linha[]>();
  for (const l of linhas) porAcao.set(l.id_acao, [...(porAcao.get(l.id_acao) ?? []), l]);

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monitoramento de Obras";
  wb.created = new Date();

  // ───────── Ações (uma linha por ação) ─────────
  const ws = wb.addWorksheet("Ações", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  ws.columns = [{ width: 10 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 24 }, { width: 22 }, { width: 11 }, { width: 10 }, { width: 14 }, { width: 55 }, { width: 28 }, { width: 13 }, { width: 13 }];
  ws.mergeCells(1, 1, 1, 13);
  ws.getCell(1, 1).value = "Verificação de bairros";
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: AZUL_ESCURO } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, 13);
  ws.getCell(2, 1).value = `Gerado em ${agora} por ${perfil.nome ?? "Usuário"} · ${porAcao.size.toLocaleString("pt-BR")} ação(ões)` + (filtros.length ? ` · Filtros: ${filtros.join("; ")}` : "");
  ws.getCell(2, 1).font = { size: 9, color: { argb: "FF6B6A66" } };
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = filtros.length > 2 ? 42 : 24;
  cabecalho(ws, ["ID", "Nome da ação", "Órgão", "Status", "Estágio", "Origem do traçado", "Extensão (km)", "Nº de bairros", "Situação", "Município - Bairro", "Fora dos bairros", "Criada em", "Ano de conclusão"], 4);
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };

  let r = 5;
  for (const [id, ls] of porAcao) {
    const base = ls[0];
    const bairros = ls.filter((l) => l.bairro);
    const semBairro = ls.filter((l) => l.municipio && l.bairro === "");
    const extensao = base.extensao_m;
    const detalhe = (l: Linha) => [extensao > 0 ? porcento(l.pct ?? 0) : "", (l.pontos ?? 0) > 0 ? `${l.pontos} ponto${(l.pontos ?? 0) > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
    const fora = [extensao > 0 && base.metros_fora / extensao >= 0.1 ? `${porcento(base.metros_fora / extensao)} do trecho` : "", (base.pontos_fora ?? 0) > 0 ? `${base.pontos_fora} ponto(s)` : ""].filter(Boolean).join(" e ");
    const row = ws.getRow(r++);
    row.values = [
      { text: id, hyperlink: urlAcaoSimo(id) },
      base.nome_acao ?? "",
      base.orgao ?? "",
      base.status ?? "",
      base.estagio_atual ?? "",
      ORIGEM[base.fonte] ?? base.fonte,
      Math.round(extensao / 10) / 100,
      bairros.length,
      bairros.length === 0 ? (semBairro.length > 0 ? `Sem bairro mapeado (${semBairro.map((l) => l.municipio).join(", ")})` : "Sem bairro mapeado") : bairros.length === 1 ? "Um só bairro" : "Mais de um bairro",
      [...bairros.map((l) => `${l.municipio} - ${l.bairro} (${detalhe(l)})`), ...semBairro.map((l) => `${l.municipio} - sem bairro mapeado (${detalhe(l)})`)].join("; "),
      fora,
      datas.get(id)?.criada ?? "",
      datas.get(id)?.conclusao ?? "",
    ];
    row.getCell(1).font = { color: { argb: "FF1D4ED8" }, underline: true };
    row.getCell(7).numFmt = "#,##0.00";
    row.eachCell((c) => {
      c.border = { bottom: BORDA };
      c.alignment = { vertical: "top", wrapText: true };
    });
  }

  // ───────── Por bairro (uma linha por ação e bairro) ─────────
  const wb2 = wb.addWorksheet("Por bairro", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  wb2.columns = [{ width: 10 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 13 }, { width: 13 }];
  cabecalho(wb2, ["ID", "Nome da ação", "Órgão", "Status", "Município", "Bairro", "Metros no bairro", "% do trecho", "Pontos", "Criada em", "Ano de conclusão"], 1);
  wb2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
  let r2 = 2;
  for (const l of linhas) {
    const row = wb2.getRow(r2++);
    row.values = [
      { text: l.id_acao, hyperlink: urlAcaoSimo(l.id_acao) },
      l.nome_acao ?? "",
      l.orgao ?? "",
      l.status ?? "",
      l.municipio ?? "(sem município)",
      l.municipio ? (l.bairro === "" ? "(sem bairro mapeado)" : l.bairro ?? "") : "",
      l.municipio ? l.metros ?? 0 : null,
      l.municipio && l.extensao_m > 0 ? l.pct ?? 0 : null,
      l.municipio ? l.pontos ?? 0 : null,
      datas.get(l.id_acao)?.criada ?? "",
      datas.get(l.id_acao)?.conclusao ?? "",
    ];
    row.getCell(1).font = { color: { argb: "FF1D4ED8" }, underline: true };
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).numFmt = "0.0%";
    row.eachCell((c) => {
      c.border = { bottom: BORDA };
      c.alignment = { vertical: "top", wrapText: true };
    });
  }

  const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="verificacao-bairros-${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

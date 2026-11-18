import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

// Relatório de todos os pares de obras ("ID x ID") marcados COM PROBLEMA (aguardando solução).
// Os dados saem da mesma função da tela, então o relatório bate com o que o painel mostra.

export type ObraDoPar = {
  id: string;
  nome: string;
  orgao: string;
  status: string;
  percentual: number | null; // 0 a 100
  contrato: string;
  principal: boolean;
};

export type ParComProblema = {
  chave: string;
  obras: ObraDoPar[];
  orgaos: string[];
  extensaoM: number | null;
  trechos: number;
  observacao: string;
  responsavel: string;
  analisadoEm: string | null;
  mapa: string;
};

type LinhaRpc = {
  chave_local: string;
  obras: { id: string | null; nome: string; orgao: string | null; status?: string | null }[];
  extensao_total: number | null;
  qtd_trechos: number;
  lat_inicio: number | null;
  lon_inicio: number | null;
  observacao: string | null;
  responsavel_nome: string | null;
  revisado_em: string | null;
};

type ObraViva = { id_acao: string; status: string | null; percentual_execucao: number | null; numero_automatico: string | null; numero_siafe: string | null };

export async function buscarParesComProblema(supabase: SupabaseClient, orgaos: string[] = [], destino: "pendencias" | "cgfr" = "pendencias", semVicinais = false, semCanceladas = false): Promise<ParComProblema[]> {
  const linhas: LinhaRpc[] = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await supabase.rpc("sobreposicoes_pares_lista", { filtro_status: "problema", grupo_situacao: "", orgaos_filtro: orgaos.length ? orgaos : null, destino_filtro: destino, sem_vicinais: semVicinais, sem_canceladas: semCanceladas, pagina, tamanho: 500 });
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as LinhaRpc[];
    linhas.push(...lote);
    if (lote.length < 500) break;
  }

  // Situação atual de cada ação (a lista guarda a foto do CSV).
  const ids = Array.from(new Set(linhas.flatMap((l) => l.obras.map((o) => o.id).filter((i): i is string => !!i))));
  const vivas = new Map<string, ObraViva>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("obras")
      .select("id_acao, status, percentual_execucao, numero_automatico, numero_siafe")
      .in("id_acao", ids.slice(i, i + 200));
    for (const o of (data ?? []) as ObraViva[]) vivas.set(o.id_acao, o);
  }

  return linhas.map((l) => {
    const ordenadas = [...l.obras].sort((a, b) => (parseInt(a.id ?? "", 10) || Infinity) - (parseInt(b.id ?? "", 10) || Infinity));
    const obras: ObraDoPar[] = ordenadas.map((o, k) => {
      const v = o.id ? vivas.get(o.id) : undefined;
      return {
        id: o.id ?? "?",
        nome: o.nome ?? "",
        orgao: (o.orgao ?? "").trim() || "Sem órgão",
        status: (v?.status || o.status || "Sem status") as string,
        percentual: v?.percentual_execucao != null ? Math.round(v.percentual_execucao * 10000) / 100 : null,
        contrato: v?.numero_automatico ? `Contrato ${v.numero_automatico}` : v?.numero_siafe ? `SIAFE ${v.numero_siafe} (não vinculado)` : "Sem contrato SIAFE",
        principal: k === 0,
      };
    });
    return {
      chave: l.chave_local,
      obras,
      orgaos: Array.from(new Set(obras.map((o) => o.orgao))),
      extensaoM: l.extensao_total != null ? Math.round(l.extensao_total) : null,
      trechos: l.qtd_trechos,
      observacao: (l.observacao ?? "").trim(),
      responsavel: l.responsavel_nome ?? "",
      analisadoEm: l.revisado_em,
      mapa: l.lat_inicio != null && l.lon_inicio != null ? `https://www.google.com/maps?q=${l.lat_inicio},${l.lon_inicio}` : "",
    };
  });
}

const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");

export async function excelParesComProblema(pares: ParComProblema[], orgaosFiltro: string[] = [], destino: "pendencias" | "cgfr" = "pendencias"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monitoramento de Obras";
  wb.created = new Date();

  const estilo = (ws: ExcelJS.Worksheet, colunas: number, linhas: number) => {
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD98C00" } };
    cab.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (linhas > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas } };
  };

  // Aba 1: uma linha por par.
  const ws = wb.addWorksheet(destino === "cgfr" ? "Pares no CGFR" : "Pares com problema");
  ws.columns = [
    { header: "Nº", key: "n", width: 6 },
    { header: "IDs do par", key: "ids", width: 22 },
    { header: "Órgãos", key: "orgaos", width: 26 },
    { header: "Ações (ID: nome)", key: "nomes", width: 70 },
    { header: "Status e execução de cada ação", key: "situacao", width: 48 },
    { header: "Metros sobrepostos (soma)", key: "metros", width: 16 },
    { header: "Trechos", key: "trechos", width: 9 },
    { header: "Problema registrado", key: "obs", width: 60 },
    { header: "Responsável", key: "resp", width: 24 },
    { header: "Analisado em", key: "quando", width: 13 },
    { header: "Ver início no mapa", key: "mapa", width: 40 },
  ];
  pares.forEach((p, i) => {
    ws.addRow({
      n: i + 1,
      ids: p.obras.map((o) => o.id).join(" × "),
      orgaos: p.orgaos.join(", "),
      nomes: p.obras.map((o) => `${o.id}: ${o.nome}`).join("\n"),
      situacao: p.obras.map((o) => `${o.id}: ${o.status}${o.percentual != null ? ` · ${o.percentual.toLocaleString("pt-BR")}%` : ""}`).join("\n"),
      metros: p.extensaoM,
      trechos: p.trechos,
      obs: p.observacao || "(sem observação)",
      resp: p.responsavel,
      quando: dataBr(p.analisadoEm),
      mapa: p.mapa,
    });
  });
  [4, 5, 8].forEach((c) => (ws.getColumn(c).alignment = { vertical: "top", wrapText: true }));
  ws.getColumn(6).numFmt = "#,##0";
  estilo(ws, 11, pares.length);

  // Aba 2: uma linha por ação de cada par (para filtrar por ID, órgão ou status da obra).
  const wo = wb.addWorksheet("Ações dos pares");
  wo.columns = [
    { header: "Nº do par", key: "n", width: 10 },
    { header: "ID da ação", key: "id", width: 12 },
    { header: "Principal", key: "principal", width: 10 },
    { header: "Órgão", key: "orgao", width: 26 },
    { header: "Nome da ação", key: "nome", width: 70 },
    { header: "Status", key: "status", width: 22 },
    { header: "% executado", key: "pct", width: 12 },
    { header: "Contrato", key: "contrato", width: 30 },
    { header: "Outras ações do par", key: "outras", width: 24 },
    { header: "Problema registrado", key: "obs", width: 60 },
  ];
  pares.forEach((p, i) => {
    for (const o of p.obras) {
      wo.addRow({
        n: i + 1,
        id: Number(o.id) || o.id,
        principal: o.principal ? "Sim" : "",
        orgao: o.orgao,
        nome: o.nome,
        status: o.status,
        pct: o.percentual,
        contrato: o.contrato,
        outras: p.obras.filter((x) => x.id !== o.id).map((x) => x.id).join(", "),
        obs: p.observacao || "(sem observação)",
      });
    }
  });
  wo.getColumn(10).alignment = { vertical: "top", wrapText: true };
  estilo(wo, 10, pares.length);

  const wr = wb.addWorksheet("Resumo");
  wr.columns = [{ header: "Item", key: "i", width: 40 }, { header: "Valor", key: "v", width: 60 }];
  wr.addRow({ i: "Relatório", v: destino === "cgfr" ? "Sobreposições: pares de obras enviados ao CGFR (aguardando solução)" : "Sobreposições: pares de obras com problema (aguardando solução)" });
  if (orgaosFiltro.length) wr.addRow({ i: "Filtro de órgão", v: orgaosFiltro.join(", ") });
  wr.addRow({ i: "Gerado em", v: new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }) });
  wr.addRow({ i: destino === "cgfr" ? "Pares no CGFR" : "Pares com problema", v: pares.length });
  wr.addRow({ i: "Metros sobrepostos (soma de todos)", v: pares.reduce((s, p) => s + (p.extensaoM ?? 0), 0) });
  const porOrgao = new Map<string, number>();
  for (const p of pares) for (const o of p.orgaos) porOrgao.set(o, (porOrgao.get(o) ?? 0) + 1);
  wr.addRow({});
  wr.addRow({ i: "Pares por órgão (um par conta para cada órgão envolvido)", v: "" }).font = { bold: true };
  for (const [o, n] of Array.from(porOrgao.entries()).sort((a, b) => b[1] - a[1])) wr.addRow({ i: o, v: n });
  estilo(wr, 2, 0);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

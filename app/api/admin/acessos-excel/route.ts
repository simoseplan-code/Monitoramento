import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERMISSOES, ROTULO_FUNCAO, TELAS_E_ACESSOS, funcaoEfetiva, type Funcao } from "@/lib/acessos";

export const runtime = "nodejs";
export const maxDuration = 30;

const AZUL = "FF1F2A44";
const VERDE = "FFD6F0DC";
const VERMELHO = "FFF8DADA";
const BORDA = { style: "thin" as const, color: { argb: "FFD9DBE1" } };

type Perfil = { nome: string | null; email: string | null; cargo: string | null; papel: string | null; status: string | null; created_at: string | null; approved_at: string | null };

const STATUS_ROTULO: Record<string, string> = { aprovado: "Ativo", digepi: "Ativo", pendente: "Aguardando aprovação", rejeitado: "Rejeitado" };

function cabecalho(ws: ExcelJS.Worksheet) {
  const linha = ws.getRow(1);
  linha.height = 54;
  linha.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true, textRotation: 0 };
    c.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
  });
}

function marcarSimNao(c: ExcelJS.Cell, sim: boolean) {
  c.value = sim ? "Sim" : "Não";
  c.alignment = { horizontal: "center", vertical: "middle" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sim ? VERDE : VERMELHO } };
  c.border = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
}

// Planilha de acessos: uma linha por pessoa (nome, e-mail, função) e uma coluna por tela e por permissão.
// Só admin e chefe (quem vê a tela Equipe).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { data: eu } = await supabase.from("profiles").select("nome, is_admin, status").eq("id", user.id).single();
    if (!eu?.is_admin || eu.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { data, error } = await createAdminClient().from("profiles").select("nome, email, cargo, papel, status, created_at, approved_at").order("nome");
    if (error) return NextResponse.json({ error: "Não consegui ler as pessoas." }, { status: 500 });
    const pessoas = (data ?? []) as Perfil[];
    const ordem: Record<string, number> = { admin: 0, chefe: 1, equipe: 2, digepi: 3 };
    pessoas.sort((a, b) => {
      const fa = funcaoEfetiva(a.papel, a.status);
      const fb = funcaoEfetiva(b.papel, b.status);
      return (fa ? ordem[fa] : 9) - (fb ? ordem[fb] : 9) || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Monitoramento de Obras";
    wb.created = new Date();

    // ───────── Aba 1: uma linha por pessoa ─────────
    const ws = wb.addWorksheet("Acessos por usuário", { views: [{ state: "frozen", xSplit: 5, ySplit: 1 }] });
    const colunasFixas = ["Nome", "E-mail", "Cargo", "Função", "Situação"];
    ws.addRow([...colunasFixas, ...TELAS_E_ACESSOS.map((t) => `${t.grupo}\n${t.tela}`), ...PERMISSOES.map((p) => p.permissao)]);
    ws.columns = [{ width: 30 }, { width: 34 }, { width: 22 }, { width: 16 }, { width: 20 }, ...TELAS_E_ACESSOS.map(() => ({ width: 16 })), ...PERMISSOES.map(() => ({ width: 24 }))];
    cabecalho(ws);

    for (const p of pessoas) {
      const f = funcaoEfetiva(p.papel, p.status);
      const linha = ws.addRow([p.nome ?? "", p.email ?? "", p.cargo ?? "", f ? ROTULO_FUNCAO[f] : "Sem acesso", STATUS_ROTULO[p.status ?? ""] ?? p.status ?? ""]);
      TELAS_E_ACESSOS.forEach((t, i) => marcarSimNao(linha.getCell(colunasFixas.length + 1 + i), !!f && t.regra(f)));
      PERMISSOES.forEach((perm, i) => marcarSimNao(linha.getCell(colunasFixas.length + TELAS_E_ACESSOS.length + 1 + i), !!f && perm.regra(f)));
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunasFixas.length + TELAS_E_ACESSOS.length + PERMISSOES.length } };

    // ───────── Aba 2: o que cada função acessa ─────────
    const wf = wb.addWorksheet("Por função", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
    const funcoes: Funcao[] = ["admin", "chefe", "equipe", "digepi"];
    wf.addRow(["Tela / permissão", "Grupo", ...funcoes.map((f) => ROTULO_FUNCAO[f])]);
    wf.columns = [{ width: 58 }, { width: 22 }, ...funcoes.map(() => ({ width: 16 }))];
    cabecalho(wf);
    for (const t of TELAS_E_ACESSOS) {
      const linha = wf.addRow([t.tela, t.grupo]);
      funcoes.forEach((f, i) => marcarSimNao(linha.getCell(3 + i), t.regra(f)));
    }
    for (const perm of PERMISSOES) {
      const linha = wf.addRow([perm.permissao, "Permissão"]);
      funcoes.forEach((f, i) => marcarSimNao(linha.getCell(3 + i), perm.regra(f)));
    }

    // ───────── Aba 3: observações ─────────
    const wo = wb.addWorksheet("Observações");
    wo.columns = [{ width: 120 }];
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
    [
      `Gerado em ${agora} por ${eu.nome ?? "Usuário"}.`,
      "Os acessos seguem as regras do painel na data da geração (menu, bloqueios de página e APIs). Se uma regra mudar, gere a planilha de novo.",
      "Cadastro pendente ou rejeitado não entra no painel (\"Sem acesso\").",
      "DIGEPI: só o Mapa de Recursos Hídricos, e só as tipologias adutora, barragem, sistema de abastecimento de água, cisterna, poço e rede de distribuição de água.",
      "Chefe vê a lista da Equipe, mas só o Administrador aprova cadastros, muda função e reseta senha.",
      "Mapa geral (traçados de todas as obras): só Administrador e Chefe. Equipe e DIGEPI veem traçado apenas de obras de recursos hídricos, no Mapa de Recursos Hídricos.",
    ].forEach((t) => {
      const c = wo.addRow([t]).getCell(1);
      c.alignment = { wrapText: true, vertical: "top" };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="acessos-por-usuario-${hoje}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("acessos excel:", e);
    return NextResponse.json({ error: "Falha ao gerar a planilha." }, { status: 500 });
  }
}

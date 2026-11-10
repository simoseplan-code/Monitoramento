// Leitura dos "Boletins de medição" de uma ação direto do SIMO (somente leitura).
// O SIMO guarda a ação aberta na sessão: antes de listar, abre a página da ação.
// Lista: POST /cahier/action/projects/measurement/index/  corpo: source=action_project&project_id=ID  -> HTML da tabela.

import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo } from "@/lib/simo/client";

const SIMO = "http://simo.pi.gov.br";

export type BoletimMedicao = {
  /** ID interno do boletim no SIMO (usado no formulário de edição). */
  idSimo: string;
  numero: string;
  /** Data no formato AAAA-MM-DD (ou null se não vier). */
  data: string | null;
  tipo: string;
  responsavel: string;
  orgao: string;
  valor: number;
};

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function dinheiro(v: string): number {
  const n = Number(v.replace(/[^\d,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function dataIso(v: string): string | null {
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Transforma o HTML devolvido pelo SIMO (tabela #measurement-list) em lista de boletins. */
export function lerBoletins(html: string): BoletimMedicao[] {
  const saida: BoletimMedicao[] = [];
  for (const linha of html.matchAll(/<tr\b[^>]*class="[^"]*item_line[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const corpo = linha[1];
    const celulas = [...corpo.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (celulas.length < 6) continue;
    const idSimo = corpo.match(/data-id="(\d+)"/)?.[1] ?? corpo.match(/measurement\/form\/id\/(\d+)/)?.[1] ?? "";
    saida.push({
      idSimo,
      numero: texto(celulas[0]),
      data: dataIso(texto(celulas[1])),
      tipo: texto(celulas[2]),
      responsavel: texto(celulas[3]),
      orgao: texto(celulas[4]),
      valor: dinheiro(texto(celulas[5])),
    });
  }
  return saida;
}

/** Abre a ação na sessão e lista os boletins de medição dela. `cookie` vem de loginSimo(). */
export async function buscarBoletins(cookie: string, idAcao: string, timeoutMs = 30_000): Promise<BoletimMedicao[]> {
  if (!/^\d{1,12}$/.test(idAcao)) throw new Error("ID da ação inválido.");
  let c = cookie;
  const abertura = await fetch(`${SIMO}/cahier/action/projects/show/id/${idAcao}`, { headers: { Cookie: c }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  const novos = abertura.headers.getSetCookie?.() ?? [];
  if (novos.length) c = [c, ...novos.map((x) => x.split(";")[0])].join("; ");
  await abertura.arrayBuffer();

  const resp = await fetch(`${SIMO}/cahier/action/projects/measurement/index/`, {
    method: "POST",
    headers: {
      Cookie: c,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${SIMO}/cahier/action/projects/show/id/${idAcao}`,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ source: "action_project", project_id: idAcao }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`SIMO: falha ao listar medições da ação ${idAcao} (HTTP ${resp.status}).`);
  const html = await resp.text();
  if (/<html/i.test(html.slice(0, 300))) throw new Error("SIMO devolveu uma página inteira (sessão expirada?).");
  return lerBoletins(html);
}

// ---------- leitura em lote, gravando no banco ----------


const PAUSA_MS = 250;
// Corta com folga antes do limite da rota (maxDuration em app/api/admin/medicoes/route.ts).
const LIMITE_TEMPO_MS = 45_000;

export type ResultadoLoteMedicoes = {
  lidas: number;
  comBoletim: number;
  falhas: number;
  /** IDs que ficaram sem ler (acabou o tempo): mande de novo para continuar. */
  restantes: string[];
  erros: { idAcao: string; erro: string }[];
};

/** Lê os boletins de cada ação no SIMO e grava no banco (troca os boletins antigos da ação pelos de agora). */
export async function lerMedicoesLote(ids: string[]): Promise<ResultadoLoteMedicoes> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const unicos = Array.from(new Set(ids.map((i) => i.trim()).filter((i) => /^\d{1,12}$/.test(i))));
  const resultado: ResultadoLoteMedicoes = { lidas: 0, comBoletim: 0, falhas: 0, restantes: [], erros: [] };
  if (unicos.length === 0) return resultado;

  const cookie = await loginSimo();
  for (let i = 0; i < unicos.length; i++) {
    if (Date.now() - inicio > LIMITE_TEMPO_MS) {
      resultado.restantes = unicos.slice(i);
      break;
    }
    const idAcao = unicos[i];
    try {
      const boletins = await buscarBoletins(cookie, idAcao);
      // Troca tudo da ação: boletim apagado no SIMO some daqui também.
      const { error: e1 } = await admin.from("medicoes_simo").delete().eq("id_acao", idAcao);
      if (e1) throw new Error(e1.message);
      if (boletins.length) {
        const { error: e2 } = await admin.from("medicoes_simo").insert(
          boletins.map((b) => ({ id_acao: idAcao, id_simo: b.idSimo || `${b.numero}-${b.data}`, numero: b.numero, data: b.data, tipo: b.tipo, responsavel: b.responsavel, orgao: b.orgao, valor: b.valor }))
        );
        if (e2) throw new Error(e2.message);
      }
      await admin.from("medicoes_leitura").upsert({ id_acao: idAcao, lido_em: new Date().toISOString(), qtd_boletins: boletins.length, erro: null });
      resultado.lidas++;
      if (boletins.length) resultado.comBoletim++;
    } catch (e) {
      const erro = e instanceof Error ? e.message : "erro desconhecido";
      await admin.from("medicoes_leitura").upsert({ id_acao: idAcao, lido_em: new Date().toISOString(), qtd_boletins: 0, erro });
      resultado.falhas++;
      resultado.erros.push({ idAcao, erro });
    }
    if (i < unicos.length - 1) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  return resultado;
}

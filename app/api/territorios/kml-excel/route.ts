import { NextResponse, type NextRequest } from "next/server";
import { gunzipSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";
import { acessoDoUsuario, idsHidricos } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { amostrar, comprimentoM, lerKml, textoDoArquivo } from "@/lib/kml/analisar";
import { carregarBairros, carregarMunicipios, type Bairro, type Municipio } from "@/lib/bairros/calcular";
import { carregarSetores } from "@/lib/bairros/setores";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lote pequeno: a tela chama esta rota várias vezes até cobrir TODAS as ações do filtro.
const LOTE = 12;
const PASSO_M = 15;

type Coord = [number, number];
type Zona = { b: [number, number, number, number]; g: number[][][][] };

function dentroDoAnel(p: Coord, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function dentroDaZona(p: Coord, z: Zona): boolean {
  if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) return false;
  for (const pol of z.g) if (dentroDoAnel(p, pol[0]) && !pol.slice(1).some((f) => dentroDoAnel(p, f))) return true;
  return false;
}

export type LinhaKmExcel = {
  id: string;
  pasta: string;
  geometria: string;
  tipo: "Trecho" | "Ponto" | "Polígono";
  municipio: string;
  bairro: string;
  zona: string;
  /** km da geometria dentro deste bairro (só trechos). */
  km: number | null;
  /** km da geometria inteira (só trechos). */
  kmTotal: number | null;
};
export type SemKmExcel = { id: string; motivo: string };

// Dados do KML guardado das ações pedidas, uma linha por geometria e bairro (para o Excel "Dados do KML").
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const acesso = await acessoDoUsuario(supabase, user.id);
    if (!acesso.liberado) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const corpo = (await request.json().catch(() => null)) as { ids?: unknown; todos?: unknown; apos?: unknown } | null;
    const admin = createAdminClient();
    // Modo "todos": percorre TODOS os KML guardados (sem filtro), LOTE por vez; "apos" é o último ID já lido.
    const todos = corpo?.todos === true;
    let proximo: string | null = null;
    let total: number | null = null;
    let ids: string[] = [];
    if (todos) {
      const apos = typeof corpo?.apos === "string" && /^\d{1,12}$/.test(corpo.apos) ? corpo.apos : "";
      if (!apos) {
        const { count } = await admin.from("kml_arquivos").select("id_acao", { count: "exact", head: true }).eq("situacao", "baixado");
        total = count ?? 0;
      }
      let q = admin.from("kml_arquivos").select("id_acao").eq("situacao", "baixado").order("id_acao").limit(LOTE);
      if (apos) q = q.gt("id_acao", apos);
      const { data: pagina, error: e0 } = await q;
      if (e0) throw new Error(e0.message);
      ids = (pagina ?? []).map((r) => r.id_acao as string);
      proximo = ids.length === LOTE ? ids[ids.length - 1] : null;
    } else {
      ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.map(String).filter((s) => /^\d{1,12}$/.test(s)))) : [];
      if (ids.length === 0) return NextResponse.json({ error: "Nenhuma ação pedida." }, { status: 400 });
    }
    if (!acesso.supervisor && ids.length) ids = await idsHidricos(admin, ids);
    if (ids.length > LOTE) return NextResponse.json({ error: `Peça no máximo ${LOTE} ações por vez.` }, { status: 413 });

    const info: Record<string, { nome: string; orgao: string; tipologia: string }> = {};
    if (ids.length) {
      const { data: obras } = await admin.from("obras").select("id_acao, nome_acao, orgao, tipologia").in("id_acao", ids);
      for (const o of obras ?? []) info[o.id_acao as string] = { nome: (o.nome_acao as string) ?? "", orgao: (o.orgao as string) ?? "", tipologia: (o.tipologia as string) ?? "" };
    }
    const [bairros, municipios, setores] = await Promise.all([carregarBairros(), carregarMunicipios(), carregarSetores()]);
    const { data: arquivos, error } = await admin.from("kml_arquivos").select("id_acao, situacao, kml_gzip_b64, mensagem").in("id_acao", ids);
    if (error) throw new Error(error.message);
    const porId = new Map((arquivos ?? []).map((a) => [a.id_acao as string, a]));

    const linhas: LinhaKmExcel[] = [];
    const sem: SemKmExcel[] = [];

    for (const id of ids) {
      const a = porId.get(id);
      if (!a) {
        sem.push({ id, motivo: "KML ainda não conferido no SIMO" });
        continue;
      }
      if (a.situacao === "sem_kml") {
        sem.push({ id, motivo: "Sem KML no SIMO" });
        continue;
      }
      if (a.situacao !== "baixado" || !a.kml_gzip_b64) {
        sem.push({ id, motivo: `Erro ao baixar o KML${a.mensagem ? `: ${String(a.mensagem).slice(0, 120)}` : ""}` });
        continue;
      }
      try {
        const xml = await textoDoArquivo(gunzipSync(Buffer.from(a.kml_gzip_b64 as string, "base64")));
        const { feicoes } = lerKml(xml);
        if (feicoes.length === 0) {
          sem.push({ id, motivo: "KML vazio (sem trecho, ponto ou polígono)" });
          continue;
        }
        let n = 0;
        for (const f of feicoes) {
          n++;
          const nome = f.nome || `(sem nome ${n})`;
          const tipo = f.tipo === "linha" ? "Trecho" : f.tipo === "ponto" ? "Ponto" : "Polígono";
          // Amostras: trecho e contorno de polígono a cada 15 m; ponto é ele mesmo.
          const amostras: Coord[] = f.tipo === "ponto" ? [f.coords[0]] : amostrar(f.coords, PASSO_M);
          const compM = f.tipo === "linha" ? comprimentoM(f.coords) : 0;
          const metrosPorAmostra = f.tipo === "linha" && amostras.length ? compM / amostras.length : 0;

          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of amostras) {
            if (p[0] < x0) x0 = p[0];
            if (p[0] > x1) x1 = p[0];
            if (p[1] < y0) y0 = p[1];
            if (p[1] > y1) y1 = p[1];
          }
          const toca = (z: Zona) => !(z.b[2] < x0 || z.b[0] > x1 || z.b[3] < y0 || z.b[1] > y1);
          const cb: Bairro[] = bairros.filter(toca);
          const cm: Municipio[] = municipios.filter(toca);

          const grupos = new Map<string, { municipio: string; bairro: string; n: number; u: number; r: number }>();
          for (const p of amostras) {
            const b = cb.find((z) => dentroDaZona(p, z));
            let municipio = "";
            let bairro = "";
            if (b) {
              municipio = b.m;
              bairro = b.n;
            } else {
              municipio = cm.find((z) => dentroDaZona(p, z))?.n ?? "";
            }
            const k = `${municipio}|${bairro}`;
            const g = grupos.get(k) ?? { municipio, bairro, n: 0, u: 0, r: 0 };
            g.n++;
            const z = setores.zonaDe(p);
            if (z === "U") g.u++;
            else if (z === "R") g.r++;
            grupos.set(k, g);
          }
          const kmTotal = f.tipo === "linha" ? Math.round((compM / 1000) * 1000) / 1000 : null;
          const lista = [...grupos.values()].sort((x, y) => y.n - x.n);
          for (const g of lista) {
            const tot = g.u + g.r;
            const zona = tot === 0 ? "" : g.u / tot >= 0.9 ? "Urbana" : g.r / tot >= 0.9 ? "Rural" : `Urbana ${Math.round((g.u / tot) * 100)}% · Rural ${Math.round((g.r / tot) * 100)}%`;
            linhas.push({
              id,
              pasta: f.pasta ?? "",
              geometria: nome,
              tipo,
              municipio: g.municipio || "(fora dos municípios do Piauí)",
              bairro: g.bairro || (g.municipio ? "(sem bairro mapeado)" : ""),
              zona,
              km: f.tipo === "linha" ? Math.round(((g.n * metrosPorAmostra) / 1000) * 1000) / 1000 : null,
              kmTotal,
            });
          }
        }
      } catch (e) {
        sem.push({ id, motivo: `Não consegui ler o KML: ${e instanceof Error ? e.message.slice(0, 100) : "erro"}` });
      }
    }
    return NextResponse.json({ linhas, sem, info, proximo, total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("territorios kml-excel:", msg);
    return NextResponse.json({ error: `Não foi possível ler os KML: ${msg}` }, { status: 500 });
  }
}

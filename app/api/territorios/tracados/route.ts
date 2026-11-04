import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acessoDoUsuario, idsHidricos } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import { geomExtraDe } from "@/lib/bairros/geometriaMapa";

export const runtime = "nodejs";
export const maxDuration = 30;

// Quantas ações o mapa aceita de uma vez (o resto o painel pede para filtrar). Igual ao da tela.
const LIMITE_ACOES = 1500;
// Orçamento de pontos: cada ação leva no máximo isto (as linhas são amostradas), e o total tem teto.
const PONTOS_POR_ACAO = 120;
const PONTOS_TOTAL = 140_000;

type LatLon = [number, number];
type Coord = [number, number]; // [lon, lat]

function amostrar(pts: Coord[], max: number): LatLon[] {
  const passo = Math.max(1, Math.ceil(pts.length / max));
  const saida: LatLon[] = [];
  for (let i = 0; i < pts.length; i += passo) saida.push([pts[i][1], pts[i][0]]);
  const ult = pts[pts.length - 1];
  const fim = saida[saida.length - 1];
  if (pts.length > 1 && (fim[0] !== ult[1] || fim[1] !== ult[0])) saida.push([ult[1], ult[0]]);
  return saida;
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

// Traçado simplificado das ações pedidas (o do mapa de obras vale; o KML guardado completa o que o mapa não tem).
// Aberto a toda a equipe aprovada, como o "Verificar KML".
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const acesso = await acessoDoUsuario(supabase, user.id);
    if (!acesso.liberado) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const corpo = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    let ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.map(String).filter((s) => /^\d{1,12}$/.test(s)))) : [];
    if (ids.length === 0) return NextResponse.json({ error: "Nenhuma ação pedida." }, { status: 400 });
    if (acesso.digepi) ids = await idsHidricos(createAdminClient(), ids);
    if (ids.length > LIMITE_ACOES) return NextResponse.json({ error: `São ${ids.length} ações: filtre até ${LIMITE_ACOES} para gerar o mapa.` }, { status: 413 });

    const admin = createAdminClient();
    const wktMapa = new Map<string, string>();
    const wktKml = new Map<string, string>();
    const lotes = emLotes(ids, 60);
    await Promise.all(
      lotes.map(async (lote) => {
        const [a, b] = await Promise.all([
          admin.from("obras_tracado").select("id_acao, wkt").in("id_acao", lote),
          admin.from("kml_arquivos").select("id_acao, wkt").in("id_acao", lote).not("wkt", "is", null),
        ]);
        if (a.error) throw new Error(a.error.message);
        if (b.error) throw new Error(b.error.message);
        for (const r of a.data ?? []) if (r.wkt) wktMapa.set(r.id_acao as string, r.wkt as string);
        for (const r of b.data ?? []) if (r.wkt) wktKml.set(r.id_acao as string, r.wkt as string);
      })
    );
    const extras = await geomExtraDe(admin, ids).catch(() => new Map());

    // Quanto cada ação pode ocupar, para o total caber no teto.
    const porAcao = Math.max(20, Math.min(PONTOS_POR_ACAO, Math.floor(PONTOS_TOTAL / Math.max(1, ids.length))));

    const acoes: { id: string; linhas: LatLon[][]; pontos: LatLon[]; poligonos: LatLon[][] }[] = [];
    let semTracado = 0;
    for (const id of ids) {
      const wkt = wktMapa.get(id) ?? wktKml.get(id);
      const linhasBrutas = wkt ? wktParaLinhasLonLat(wkt) : [];
      const extra = extras.get(id);
      const pontosBrutos: Coord[] = (extra?.pontos ?? []).slice(0, 30);
      const poligonosBrutos: Coord[][] = (extra?.poligonos ?? []).slice(0, 10);
      if (linhasBrutas.length === 0 && pontosBrutos.length === 0 && poligonosBrutos.length === 0) {
        semTracado++;
        continue;
      }
      const totalPts = linhasBrutas.reduce((s, l) => s + l.length, 0) || 1;
      acoes.push({
        id,
        linhas: linhasBrutas.slice(0, 40).map((l) => amostrar(l, Math.max(2, Math.round((l.length / totalPts) * porAcao)))),
        pontos: pontosBrutos.map((p) => [p[1], p[0]] as LatLon),
        poligonos: poligonosBrutos.map((p) => amostrar(p, 40)),
      });
    }
    return NextResponse.json({ acoes, semTracado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("territorios tracados:", msg);
    return NextResponse.json({ error: `Não foi possível montar o mapa: ${msg}` }, { status: 500 });
  }
}

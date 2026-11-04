import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acessoDoUsuario } from "@/lib/acesso";

export const runtime = "nodejs";

type LatLon = [number, number];
type Ponto = [number, number];

// Reduz o número de pontos de uma linha (lon, lat) e troca para (lat, lon) do Leaflet.
function reduzir(pts: Ponto[], max: number): LatLon[] {
  const passo = Math.max(1, Math.ceil(pts.length / max));
  const saida: LatLon[] = [];
  for (let i = 0; i < pts.length; i += passo) saida.push([pts[i][1], pts[i][0]]);
  const ult = pts[pts.length - 1];
  const fim = saida[saida.length - 1];
  if (pts.length > 1 && (fim[0] !== ult[1] || fim[1] !== ult[0])) saida.push([ult[1], ult[0]]);
  return saida;
}

// Mapa dos 12 territórios: o contorno externo de cada um e os municípios (para colorir por território).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const acesso = await acessoDoUsuario(supabase, user.id);
    if (!acesso.liberado) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const [contornos, municipios] = await Promise.all([
      import("@/data/geo/territorios_pi.json").then((m) => m.default as unknown as { n: string; l: Ponto[][] }[]),
      import("@/data/geo/municipios_pi.json").then((m) => m.default as unknown as { n: string; t: string | null; g: Ponto[][][] }[]),
    ]);

    // ?contornos=1: só o contorno dos territórios (o mapa de traçados não precisa dos municípios).
    const soContornos = request.nextUrl.searchParams.get("contornos") === "1";
    return NextResponse.json({
      territorios: contornos.map((t) => ({ nome: t.n, linhas: t.l.filter((l) => l.length > 1).map((l) => reduzir(l, 900)) })),
      municipios: soContornos
        ? []
        : municipios
        .filter((m) => m.t)
        .map((m) => ({ nome: m.n, territorio: m.t as string, aneis: m.g.flatMap((poligono) => poligono.slice(0, 1).map((anel) => reduzir(anel, 120))) })),
    });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível montar o mapa: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarBairros } from "@/lib/bairros/calcular";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import { pontosEContornosDoKml } from "@/lib/bairros/kmlGuardado";
import { geomExtraDe } from "@/lib/bairros/geometriaMapa";

export const runtime = "nodejs";

type LatLon = [number, number];

// Reduz o número de pontos de uma linha para o navegador (no máximo `max`).
function reduzir(pts: [number, number][], max: number): LatLon[] {
  const passo = Math.max(1, Math.ceil(pts.length / max));
  const saida: LatLon[] = [];
  for (let i = 0; i < pts.length; i += passo) saida.push([pts[i][1], pts[i][0]]);
  const ult = pts[pts.length - 1];
  const fim = saida[saida.length - 1];
  if (pts.length > 1 && (fim[0] !== ult[1] || fim[1] !== ult[0])) saida.push([ult[1], ult[0]]);
  return saida;
}

// Dados do mapa "Verificar KML" de uma ação: o traçado guardado e o contorno dos bairros em que ele cai.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const [{ data: calculo }, { data: itens }] = await Promise.all([
    supabase.from("acao_bairros_calculo").select("fonte, extensao_m, metros_fora, pontos, pontos_fora").eq("id_acao", id).maybeSingle(),
    supabase.from("acao_bairros").select("municipio, bairro, metros, pct, pontos").eq("id_acao", id).order("metros", { ascending: false }),
  ]);
  if (!calculo) return NextResponse.json({ error: "Esta ação ainda não foi verificada." }, { status: 404 });

  // O traçado fica em tabelas só do servidor (o do mapa é restrito a admin e chefe).
  const admin = createAdminClient();
  const tabela = calculo.fonte === "kml" ? "kml_arquivos" : calculo.fonte === "sobreposicoes" ? "obras_tracado" : null;
  const { data: linha } = tabela ? await admin.from(tabela).select("wkt").eq("id_acao", id).maybeSingle() : { data: null };
  const linhas = linha?.wkt ? wktParaLinhasLonLat(linha.wkt as string).map((l) => reduzir(l, 1500)) : [];
  // Pontos e polígonos: os do mapa valem; o KML guardado só completa o que o mapa não tem.
  const doMapa = (await geomExtraDe(admin, [id])).get(id);
  const doKml = doMapa?.pontos && doMapa?.poligonos ? { pontos: [], contornos: [] } : await pontosEContornosDoKml(admin, id);
  const pontos: LatLon[] = (doMapa?.pontos ?? doKml.pontos).slice(0, 2000).map((p) => [p[1], p[0]]);
  const contornos: LatLon[][] = (doMapa?.poligonos ?? doKml.contornos).slice(0, 200).map((c) => reduzir(c, 400));

  const todos = await carregarBairros();
  const bairros = (itens ?? []).map((b) => {
    const aneis: LatLon[][] = [];
    for (const z of todos.filter((x) => x.m === b.municipio && x.n === b.bairro)) {
      for (const poligono of z.g) for (const anel of poligono) aneis.push(reduzir(anel as [number, number][], 400));
    }
    return { municipio: b.municipio as string, bairro: b.bairro as string, metros: b.metros as number, pct: b.pct as number, pontos: (b.pontos as number) ?? 0, aneis };
  });

  return NextResponse.json({ fonte: calculo.fonte, extensaoM: calculo.extensao_m, metrosFora: calculo.metros_fora, pontosFora: calculo.pontos_fora ?? 0, totalPontos: calculo.pontos ?? 0, linhas, pontos, contornos, bairros });
}

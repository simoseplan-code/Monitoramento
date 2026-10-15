import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectarSobreposicoes, TOLERANCIA_PADRAO_M, type FeicaoLinha } from "@/lib/sobreposicoes/detectar";
import { aplicarLocais, ErroImportacao } from "@/lib/sobreposicoes/importar";
import { feicoesDeKmlGuardado } from "@/lib/sobreposicoes/kmlGuardados";

export const runtime = "nodejs";
export const maxDuration = 300;

// Arquivo de linhas das obras que o mapa publica todo dia (o mesmo que o mapa usa).
const URL_LINHAS = process.env.OBRAS_LINHAS_URL || "https://pub-8891acbff66c47a0822bc6d565e97a2d.r2.dev/obras_linhas.geojson";
const LIMITE_BYTES = 120 * 1024 * 1024;

function caixaDoWkt(wkt: string): { min_lon: number; min_lat: number; max_lon: number; max_lat: number } | null {
  let x0 = 181, y0 = 91, x1 = -181, y1 = -91;
  for (const m of wkt.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    const x = Number(m[1]), y = Number(m[2]);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 > 180 ? null : { min_lon: x0, min_lat: y0, max_lon: x1, max_lat: y1 };
}

// Atualiza as Sobreposições direto do mapa, sem CSV: baixa os traçados, detecta com a
// tolerância padrão e aplica. Com { simular: true } só mostra o que mudaria, sem gravar nada.
// O que já foi analisado nunca é apagado nem sobrescrito (ver lib/sobreposicoes/importar.ts).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const corpo = (await request.json().catch(() => ({}))) as { simular?: unknown };
  const simular = corpo.simular === true;

  try {
    const resp = await fetch(URL_LINHAS, { signal: AbortSignal.timeout(120_000), cache: "no-store" });
    if (!resp.ok) return NextResponse.json({ error: `Não consegui baixar os traçados do mapa (HTTP ${resp.status}).` }, { status: 502 });
    if (Number(resp.headers.get("content-length") ?? 0) > LIMITE_BYTES) return NextResponse.json({ error: "O arquivo de traçados está grande demais." }, { status: 502 });
    const geo = (await resp.json()) as { features?: FeicaoLinha[] };
    if (!Array.isArray(geo.features) || geo.features.length === 0) return NextResponse.json({ error: "O arquivo de traçados veio vazio." }, { status: 502 });

    // Ações que têm KML guardado mas ainda não estão no arquivo do mapa (ação nova, em execução...)
    // também entram na detecção. Se o ID já está no mapa, o do mapa vale.
    const admin = createAdminClient();
    const idsNoMapa = new Set<string>();
    for (const f of geo.features) {
      const id = f.properties?.["ID da Ação"];
      if (id != null && f.geometry) idsNoMapa.add(String(id));
    }
    const extras = await feicoesDeKmlGuardado(admin, idsNoMapa).catch((e) => {
      // Falha ao ler os KMLs guardados não impede a atualização pelo mapa.
      console.error("atualizar sobreposicoes (kml guardados):", e instanceof Error ? e.message : e);
      return { feicoes: [] as FeicaoLinha[], acoes: 0 };
    });

    const det = detectarSobreposicoes([...geo.features, ...extras.feicoes], TOLERANCIA_PADRAO_M);
    // Trava de segurança: uma detecção que "achou quase nada" quase sempre é arquivo ruim, e
    // aplicar isso removeria locais por engano.
    if (det.locais.length < 100) {
      const e = det.estatisticas;
      console.error("atualizar sobreposicoes: detecção abaixo do normal", e, "features", geo.features.length);
      return NextResponse.json(
        {
          error:
            `A detecção encontrou só ${det.locais.length} local(is), muito abaixo do normal. Nada foi alterado. ` +
            `(linhas lidas: ${geo.features.length}, consideradas: ${e.linhasConsideradas}, pares comparados: ${e.paresComparados}, erros no cálculo: ${e.errosNoCalculo}${e.primeiroErro ? `, primeiro erro: ${e.primeiroErro}` : ""})`,
        },
        { status: 422 }
      );
    }

    const resumo = await aplicarLocais(supabase, det.locais, simular);
    if (simular) return NextResponse.json({ ok: true, simulacao: true, toleranciaM: TOLERANCIA_PADRAO_M, ...resumo, acoesComTracado: det.tracadoPorObra.size, acoesDeKml: extras.acoes });

    // Desenho: trecho sobreposto de cada local e traçado completo de cada ação.
    const locais = Array.from(det.geomPorLocal, ([chave, geoms]) => ({ chave, geoms }));
    for (let i = 0; i < locais.length; i += 300) {
      const { error } = await admin.rpc("sobreposicoes_salvar_geometria", { dados: locais.slice(i, i + 300) });
      if (error) throw new ErroImportacao(`Locais atualizados, mas falhou ao salvar o desenho: ${error.message}`);
    }
    const agora = new Date().toISOString();
    // Só o traçado de quem está no mapa vai para obras_tracado; o das ações só com KML guardado fica em kml_arquivos.
    const tracados = Array.from(det.tracadoPorObra).filter(([id]) => idsNoMapa.has(id)).map(([id, wkt]) => ({ id_acao: id, wkt, atualizado_em: agora, ...(caixaDoWkt(wkt) ?? {}) }));
    for (let i = 0; i < tracados.length; i += 100) {
      const { error } = await admin.from("obras_tracado").upsert(tracados.slice(i, i + 100), { onConflict: "id_acao" });
      if (error) throw new ErroImportacao(`Locais atualizados, mas falhou ao salvar os traçados: ${error.message}`);
    }

    return NextResponse.json({ ok: true, simulacao: false, toleranciaM: TOLERANCIA_PADRAO_M, ...resumo, acoesComTracado: tracados.length, acoesDeKml: extras.acoes });
  } catch (e) {
    if (e instanceof ErroImportacao) return NextResponse.json({ error: e.message }, { status: 500 });
    console.error("atualizar sobreposicoes:", e);
    return NextResponse.json({ error: "Falha ao atualizar as sobreposições. Nada do que já foi analisado foi apagado." }, { status: 500 });
  }
}

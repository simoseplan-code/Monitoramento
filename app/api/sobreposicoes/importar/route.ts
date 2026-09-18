import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvParaSobreposicoes } from "@/lib/sobreposicoes/parseCsv";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { csv } = (await request.json()) as { csv?: string };
  if (!csv) return NextResponse.json({ error: "Nenhum CSV enviado." }, { status: 400 });

  let locais;
  try {
    locais = csvParaSobreposicoes(csv);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "CSV inválido." }, { status: 400 });
  }
  if (locais.length === 0) {
    return NextResponse.json({ error: "Nenhum local sobreposto encontrado nesse CSV." }, { status: 400 });
  }

  // Quais chaves já existem, pra reportar quantas são realmente novas
  // (as já vistas só têm os dados atualizados — status/revisão nunca é
  // sobrescrito aqui, porque a coluna nem entra no "update set" abaixo).
  const chaves = locais.map((l) => l.chave_local);
  const { data: existentes } = await supabase.from("sobreposicoes").select("chave_local").in("chave_local", chaves);
  const jaExistiam = new Set((existentes ?? []).map((r) => r.chave_local));

  const linhas = locais.map((l) => ({
    chave_local: l.chave_local,
    obras: l.obras,
    qtd_obras: l.qtd_obras,
    extensao_m: l.extensao_m,
    tolerancia_m: l.tolerancia_m,
    qtd_segmentos: l.qtd_segmentos,
    lat_inicio: l.lat_inicio,
    lon_inicio: l.lon_inicio,
    lat_fim: l.lat_fim,
    lon_fim: l.lon_fim,
    atualizado_em: new Date().toISOString(),
  }));

  // onConflict só atualiza as colunas listadas acima — status/observacao/
  // revisado_por/revisado_em ficam de fora de propósito, então uma
  // reimportação nunca apaga uma decisão já tomada sobre aquele local.
  const { error } = await supabase.from("sobreposicoes").upsert(linhas, { onConflict: "chave_local" });
  if (error) return NextResponse.json({ error: "Falha ao salvar no banco: " + error.message }, { status: 500 });

  const novos = locais.filter((l) => !jaExistiam.has(l.chave_local)).length;
  return NextResponse.json({ ok: true, total: locais.length, novos, jaExistiam: locais.length - novos });
}

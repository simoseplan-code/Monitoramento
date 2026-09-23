import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvParaSobreposicoes, type ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";

// Combinação estável dos IDs das obras de um local, ordenados — ao
// contrário de "Chave do Local" (que inclui coordenada e pode mudar
// levemente entre exportações do Mapa de Obras por arredondamento),
// isso não muda enquanto o par de obras for o mesmo. Usada pra
// reconhecer "essa combinação já foi revisada antes" mesmo quando a
// chave exata é nova. Mesma lógica de supabase/migrations/0020 (coluna
// gerada por SQL) — mantida em JS aqui só pra montar a consulta de
// combinações já revisadas antes do upsert.
function chaveObras(obras: ObraNoLocal[]): string {
  return obras
    .map((o) => o.id)
    .filter((id): id is string => !!id)
    .sort()
    .join(",");
}

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

  // Pros locais que são NOVOS (chave_local nunca vista), busca se a
  // MESMA combinação de obras já foi revisada sob uma chave_local
  // diferente (drift de coordenada entre exportações) — se achar, a
  // decisão já tomada é reaplicada agora, em vez do local reaparecer
  // como pendente de novo.
  const locaisNovos = locais.filter((l) => !jaExistiam.has(l.chave_local));
  const chaveObrasPorLocal = new Map(locaisNovos.map((l) => [l.chave_local, chaveObras(l.obras)]));
  const chavesObrasNovas = Array.from(new Set(Array.from(chaveObrasPorLocal.values()).filter(Boolean)));

  const decisaoPorChaveObras = new Map<
    string,
    { status: string; observacao: string | null; revisado_por: string | null; revisado_em: string | null }
  >();
  if (chavesObrasNovas.length > 0) {
    const { data: revisadosAntes } = await supabase
      .from("sobreposicoes")
      .select("chave_obras, status, observacao, revisado_por, revisado_em")
      .in("chave_obras", chavesObrasNovas)
      .neq("status", "pendente")
      .order("revisado_em", { ascending: false });
    (revisadosAntes ?? []).forEach((r) => {
      if (r.chave_obras && !decisaoPorChaveObras.has(r.chave_obras)) {
        decisaoPorChaveObras.set(r.chave_obras, {
          status: r.status,
          observacao: r.observacao,
          revisado_por: r.revisado_por,
          revisado_em: r.revisado_em,
        });
      }
    });
  }

  const camposBase = (l: (typeof locais)[number]) => ({
    chave_local: l.chave_local,
    chave_obras: chaveObras(l.obras) || null,
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
  });

  // Locais já conhecidos: nunca inclui status/observacao/revisado_* no
  // objeto — assim o upsert não sobrescreve uma decisão já tomada.
  const linhasExistentes = locais.filter((l) => jaExistiam.has(l.chave_local)).map(camposBase);

  // Locais novos: se a combinação de obras já tinha decisão registrada
  // sob outra chave, entra direto com essa decisão — carimbado como
  // "carregado adiante", não como se alguém tivesse revisado agora.
  const linhasNovas = locaisNovos.map((l) => {
    const decisao = decisaoPorChaveObras.get(chaveObrasPorLocal.get(l.chave_local) || "");
    if (!decisao) return camposBase(l);
    return {
      ...camposBase(l),
      status: decisao.status,
      observacao: decisao.observacao
        ? decisao.observacao
        : "Carregado automaticamente: mesma combinação de obras já revisada antes sob outra chave.",
      revisado_por: decisao.revisado_por,
      revisado_em: decisao.revisado_em,
    };
  });

  const erros: string[] = [];
  if (linhasExistentes.length > 0) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasExistentes, { onConflict: "chave_local" });
    if (error) erros.push(error.message);
  }
  if (linhasNovas.length > 0) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasNovas, { onConflict: "chave_local" });
    if (error) erros.push(error.message);
  }
  if (erros.length > 0) return NextResponse.json({ error: "Falha ao salvar no banco: " + erros.join("; ") }, { status: 500 });

  const carregadosAutomaticamente = linhasNovas.filter((l) => "status" in l && l.status !== "pendente").length;
  const novos = locaisNovos.length;
  return NextResponse.json({
    ok: true,
    total: locais.length,
    novos,
    jaExistiam: locais.length - novos,
    carregadosAutomaticamente,
  });
}

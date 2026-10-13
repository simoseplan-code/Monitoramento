import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvParaSobreposicoes, type ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";

// Combinação estável dos IDs das obras de um local, ordenados, ao
// contrário de "Chave do Local" (que inclui coordenada e pode mudar
// levemente entre exportações do Mapa de Obras por arredondamento),
// isso não muda enquanto o par de obras for o mesmo. Usada pra
// reconhecer "essa combinação já foi revisada antes" mesmo quando a
// chave exata é nova. Mesma lógica de supabase/migrations/0020 (coluna
// gerada por SQL), mantida em JS aqui só pra montar a consulta de
// combinações já revisadas antes do upsert.
export const maxDuration = 60;

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

  // Sobreposições é só para admin e chefe (a equipe fica de fora por enquanto).
  const { data: perfilAcesso } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!perfilAcesso?.is_admin) return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { csv?: unknown } | null;
  const csv = corpo?.csv;
  if (typeof csv !== "string" || !csv) return NextResponse.json({ error: "Nenhum CSV enviado." }, { status: 400 });
  if (csv.length > 20_000_000) return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 });

  let locais;
  try {
    locais = csvParaSobreposicoes(csv);
  } catch {
    return NextResponse.json({ error: "CSV inválido. Confira se é o arquivo do Mapa de Obras." }, { status: 400 });
  }
  if (locais.length === 0) {
    return NextResponse.json({ error: "Nenhum local sobreposto encontrado nesse CSV." }, { status: 400 });
  }

  // Tudo o que já está cadastrado (poucos milhares de linhas, lido em páginas):
  // consultar pelas chaves do CSV estourava o tamanho da URL com milhares de locais.
  type Existente = {
    chave_local: string;
    chave_obras: string | null;
    status: string;
    observacao: string | null;
    responsavel_id: string | null;
  };
  const existentes: Existente[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("sobreposicoes")
      .select("chave_local, chave_obras, status, observacao, responsavel_id")
      .order("chave_local")
      .range(de, de + 999);
    if (error) {
      console.error("importar sobreposicoes (leitura):", error);
      return NextResponse.json({ error: "Falha ao ler as sobreposições atuais." }, { status: 500 });
    }
    existentes.push(...((data ?? []) as Existente[]));
    if (!data || data.length < 1000) break;
  }

  const noCsv = new Set(locais.map((l) => l.chave_local));
  const jaExistiam = new Set(existentes.map((r) => r.chave_local).filter((c) => noCsv.has(c)));
  const teveAnalise = (r: Existente) => r.status !== "pendente" || !!r.responsavel_id || !!r.observacao?.trim();

  // Locais analisados que não vêm no CSV novo, por combinação de obras: se a mesma
  // combinação aparece no CSV com outra chave (ex.: outra tolerância ou coordenada
  // arredondada), a análise MUDA para a chave nova, sem duplicar o local.
  const analisadoForaDoCsv = new Map<string, Existente>();
  for (const r of existentes) {
    if (!noCsv.has(r.chave_local) && teveAnalise(r) && r.chave_obras && !analisadoForaDoCsv.has(r.chave_obras)) {
      analisadoForaDoCsv.set(r.chave_obras, r);
    }
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

  const locaisNovos = locais.filter((l) => !jaExistiam.has(l.chave_local));
  const reaproveitados: { antiga: string; novo: (typeof locais)[number] }[] = [];
  const realmenteNovos: (typeof locais)[number][] = [];
  for (const l of locaisNovos) {
    const combinacao = chaveObras(l.obras);
    const antigo = combinacao ? analisadoForaDoCsv.get(combinacao) : undefined;
    if (antigo) {
      analisadoForaDoCsv.delete(combinacao);
      reaproveitados.push({ antiga: antigo.chave_local, novo: l });
    } else {
      realmenteNovos.push(l);
    }
  }

  const admin = createAdminClient();
  const erros: string[] = [];

  // 1) Análises que mudam de chave: atualiza a linha antiga (status, responsável,
  //    observação e solução ficam como estão; só a chave e os dados do mapa mudam).
  for (const r of reaproveitados) {
    const { error } = await admin.from("sobreposicoes").update(camposBase(r.novo)).eq("chave_local", r.antiga);
    if (error) erros.push(error.message);
  }

  // 2) Locais que já existiam com a mesma chave: só os dados do mapa são atualizados
  //    (status/revisão nunca entram aqui, então a decisão nunca é sobrescrita).
  const linhasExistentes = locais.filter((l) => jaExistiam.has(l.chave_local)).map(camposBase);
  for (let i = 0; i < linhasExistentes.length; i += 500) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasExistentes.slice(i, i + 500), { onConflict: "chave_local" });
    if (error) erros.push(error.message);
  }

  // 3) Locais novos entram como pendentes.
  const linhasNovas = realmenteNovos.map(camposBase);
  for (let i = 0; i < linhasNovas.length; i += 500) {
    const { error } = await supabase.from("sobreposicoes").upsert(linhasNovas.slice(i, i + 500), { onConflict: "chave_local" });
    if (error) erros.push(error.message);
  }

  if (erros.length > 0) {
    console.error("importar sobreposicoes:", erros);
    return NextResponse.json({ error: "Falha ao salvar no banco." }, { status: 500 });
  }

  // 4) Substituição: o que não veio no CSV e nunca foi analisado sai da lista.
  //    Quem já teve análise (decisão, responsável ou observação) fica.
  const remover = existentes
    .filter((r) => !noCsv.has(r.chave_local) && !teveAnalise(r))
    .map((r) => r.chave_local);
  for (let i = 0; i < remover.length; i += 200) {
    const { error } = await admin
      .from("sobreposicoes")
      .delete()
      .in("chave_local", remover.slice(i, i + 200))
      .eq("status", "pendente")
      .is("responsavel_id", null);
    if (error) {
      console.error("importar sobreposicoes (remoção):", error);
      return NextResponse.json({ error: "Locais importados, mas falhou ao remover os antigos. Importe de novo." }, { status: 500 });
    }
  }

  const mantidosForaDoCsv = existentes.filter((r) => !noCsv.has(r.chave_local) && teveAnalise(r)).length - reaproveitados.length;
  return NextResponse.json({
    ok: true,
    total: locais.length,
    novos: realmenteNovos.length,
    jaExistiam: jaExistiam.size,
    analiseReaproveitada: reaproveitados.length,
    removidos: remover.length,
    analisadosMantidos: mantidosForaDoCsv,
  });
}

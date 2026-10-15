import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dados do popup "Mostrar sobreposição": trecho sobreposto do local + traçado de cada obra.
// O acesso (só admin e chefe) é garantido pelas regras de linha das duas tabelas.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const chave = request.nextUrl.searchParams.get("chave");
  if (!chave || chave.length > 500) return NextResponse.json({ error: "Local inválido." }, { status: 400 });

  const { data: local } = await supabase
    .from("sobreposicoes")
    .select("geom_sobreposta, obras")
    .eq("chave_local", chave)
    .maybeSingle();
  if (!local) return NextResponse.json({ error: "Local não encontrado." }, { status: 404 });

  const ids = ((local.obras ?? []) as { id: string | null }[]).map((o) => o.id).filter((id): id is string => !!id);
  const { data: tracados } = ids.length
    ? await supabase.from("obras_tracado").select("id_acao, wkt").in("id_acao", ids)
    : { data: [] as { id_acao: string; wkt: string }[] };

  // Ação que só tem KML guardado (ainda não está no mapa): usa o traçado do KML.
  const lista = [...(tracados ?? [])];
  const faltam = ids.filter((id) => !lista.some((t) => t.id_acao === id));
  if (faltam.length > 0) {
    const { data: kmls } = await supabase.from("kml_arquivos").select("id_acao, wkt").eq("situacao", "baixado").not("wkt", "is", null).in("id_acao", faltam);
    for (const k of kmls ?? []) lista.push({ id_acao: k.id_acao, wkt: k.wkt as string });
  }

  return NextResponse.json(
    { sobreposta: (local.geom_sobreposta ?? []) as string[], tracados: lista },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}

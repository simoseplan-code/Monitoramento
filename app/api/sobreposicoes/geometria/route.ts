import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recebe, em lotes, a geometria extraída do CSV no navegador:
//   locais   : [{ chave, geoms: [WKT...] }]  trecho sobreposto de cada local
//   tracados : [{ id, wkt }]                 traçado completo de cada obra
const WKT = /^(MULTI)?LINESTRING\s*\(/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") {
    return NextResponse.json({ error: "Sem permissão para Sobreposições." }, { status: 403 });
  }

  const corpo = (await request.json().catch(() => null)) as { locais?: unknown; tracados?: unknown } | null;
  if (!corpo) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });

  const locais = (Array.isArray(corpo.locais) ? corpo.locais : [])
    .filter(
      (l): l is { chave: string; geoms: string[] } =>
        typeof l?.chave === "string" &&
        Array.isArray(l?.geoms) &&
        l.geoms.every((g: unknown) => typeof g === "string" && WKT.test(g))
    )
    .slice(0, 10_000);
  const tracados = (Array.isArray(corpo.tracados) ? corpo.tracados : [])
    .filter((t): t is { id: string; wkt: string } => typeof t?.id === "string" && typeof t?.wkt === "string" && WKT.test(t.wkt))
    .slice(0, 5_000);

  let locaisSalvos = 0;
  if (locais.length > 0) {
    const { data, error } = await supabase.rpc("sobreposicoes_salvar_geometria", { dados: locais });
    if (error) {
      console.error("geometria locais:", error);
      return NextResponse.json({ error: "Falha ao salvar o trecho sobreposto." }, { status: 500 });
    }
    locaisSalvos = Number(data ?? 0);
  }

  if (tracados.length > 0) {
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("obras_tracado")
      .upsert(tracados.map((t) => ({ id_acao: t.id, wkt: t.wkt, atualizado_em: agora })), { onConflict: "id_acao" });
    if (error) {
      console.error("geometria tracados:", error);
      return NextResponse.json({ error: "Falha ao salvar o traçado das obras." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, locais: locaisSalvos, tracados: tracados.length });
}

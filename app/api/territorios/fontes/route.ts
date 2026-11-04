import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fontesDoTracado } from "@/lib/tracadosAcoes";

export const runtime = "nodejs";
export const maxDuration = 30;

const LIMITE = 3000;

// Quais ações do filtro têm traçado (georreferenciadas) e de onde vem: KML do SIMO, mapa de obras ou os dois.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
    if (perfil?.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const corpo = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(corpo?.ids) ? Array.from(new Set(corpo.ids.map(String).filter((s) => /^\d{1,12}$/.test(s)))) : [];
    if (ids.length === 0) return NextResponse.json({ fontes: {}, conferidas: {} });
    if (ids.length > LIMITE) return NextResponse.json({ error: `Até ${LIMITE} ações por vez.` }, { status: 413 });

    const admin = createAdminClient();
    const fontes = await fontesDoTracado(admin, ids);
    // Ações que já foram conferidas no SIMO e não têm KML (ou deram erro ao baixar).
    const conferidas: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from("kml_arquivos").select("id_acao, situacao").in("id_acao", ids.slice(i, i + 200)).in("situacao", ["sem_kml", "erro"]);
      for (const r of data ?? []) conferidas[r.id_acao as string] = r.situacao as string;
    }
    return NextResponse.json({ fontes: Object.fromEntries(fontes), conferidas });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar os traçados: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

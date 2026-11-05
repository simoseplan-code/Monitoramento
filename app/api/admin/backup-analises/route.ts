import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarSnapshot, montarSnapshot } from "@/lib/simo/snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

// Baixa uma cópia (arquivo .json) de tudo que a equipe digitou ou decidiu: análises, comentários, responsáveis,
// listas desconsideradas, Configuração de TD e filtros gravados. Também guarda a cópia no banco. Só admin e chefe.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { data: perfil } = await supabase.from("profiles").select("nome, is_admin, status").eq("id", user.id).single();
    if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const admin = createAdminClient();
    const foto = await montarSnapshot(admin);
    await guardarSnapshot(admin, foto, `baixada por ${perfil.nome ?? "administrador"}`).catch((e) => console.error("backup analises:", e));

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(foto), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="copia-das-analises-${hoje}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("backup analises:", e);
    return NextResponse.json({ error: "Falha ao gerar a cópia." }, { status: 500 });
  }
}

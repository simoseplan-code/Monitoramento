import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Diagnóstico (só administrador, só leitura): mostra quais colunas o relatório do SIMO traz além
// das que o painel já usa (ficam em obras.extra), quantas ações têm cada uma preenchida e
// exemplos de valores. Serve para planejar a "Análise de obras concluídas".
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const admin = createAdminClient();
  const colunas = new Map<string, { preenchidas: number; exemplos: string[]; distintos: Set<string> }>();
  let total = 0;
  let comRecebimento = 0;

  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("obras")
      .select("extra, data_receb_definitivo, data_receb_provisorio")
      .range(de, de + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const o of data ?? []) {
      total++;
      if (o.data_receb_definitivo || o.data_receb_provisorio) comRecebimento++;
      for (const [nome, valor] of Object.entries((o.extra ?? {}) as Record<string, string>)) {
        const c = colunas.get(nome) ?? { preenchidas: 0, exemplos: [], distintos: new Set<string>() };
        c.preenchidas++;
        if (c.exemplos.length < 4 && !c.exemplos.includes(valor)) c.exemplos.push(String(valor).slice(0, 60));
        if (c.distintos.size < 50) c.distintos.add(String(valor));
        colunas.set(nome, c);
      }
    }
    if (!data || data.length < 1000) break;
  }

  return NextResponse.json({
    totalDeAcoes: total,
    comDataDeRecebimento: comRecebimento,
    colunasExtras: Array.from(colunas, ([nome, c]) => ({
      nome,
      preenchidas: c.preenchidas,
      valoresDistintosAte50: c.distintos.size,
      exemplos: c.exemplos,
    })).sort((a, b) => b.preenchidas - a.preenchidas),
  });
}

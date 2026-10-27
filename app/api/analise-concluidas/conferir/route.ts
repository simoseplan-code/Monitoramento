import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { carregarObrasConcluidas, carregarObrasPorIds } from "@/lib/analiseConcluidasDados";
import {
  aditivada,
  dataDeRecebimento,
  estadoDeGravado,
  estadoPadrao,
  lerIds,
  motivosDeExclusao,
  tipoDeRecebimento,
  valorAditivo,
  valoresDosFiltros,
  valorFinal,
} from "@/lib/analiseConcluidas";

export const runtime = "nodejs";
export const maxDuration = 60;

// Conferência por ID: para cada ID colado, diz se a obra está na base e, se ficou de fora da análise,
// o motivo. Só admin e chefe.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { ids?: string; estado?: unknown } | null;
  const ids = lerIds(corpo?.ids ?? "").slice(0, 600);
  if (ids.length === 0) return NextResponse.json({ error: "Cole pelo menos um ID." }, { status: 400 });

  const [achadas, concluidas] = await Promise.all([carregarObrasPorIds(supabase, ids), carregarObrasConcluidas(supabase)]);
  if (achadas.erro || concluidas.erro) return NextResponse.json({ error: "Não consegui ler as obras." }, { status: 500 });

  const valores = valoresDosFiltros(concluidas.obras);
  const padrao = estadoPadrao(concluidas.obras);
  const estado = corpo?.estado ? estadoDeGravado(corpo.estado, padrao, valores) : padrao;
  const porId = new Map(achadas.obras.map((o) => [o.id, o]));

  const linhas = ids.map((id) => {
    const o = porId.get(id);
    if (!o) return { id, naBase: false, entra: false, motivos: ["ID não existe na base do painel"] };
    const motivos = motivosDeExclusao(o, estado);
    return {
      id,
      naBase: true,
      entra: motivos.length === 0,
      motivos,
      nome: o.nome,
      recDef: o.recDef,
      recProv: o.recProv,
      tipoRec: tipoDeRecebimento(o),
      data: dataDeRecebimento(o),
      pct: o.pct,
      classificacao: o.classificacao,
      tipoOutros: o.tipoOutros,
      original: o.original,
      total: o.total,
      valorFinal: valorFinal(o),
      aditivo: valorAditivo(o),
      aditivada: aditivada(o),
    };
  });
  return NextResponse.json({ linhas });
}

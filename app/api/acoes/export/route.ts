import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const busca = params.get("busca");
  const filtro = params.get("filtro");
  const orgao = params.get("orgao");
  const de = params.get("de");
  const ate = params.get("ate");

  // Mesmos filtros da tela (app/acoes/page.tsx) — exporta exatamente o que
  // está sendo visto, não a base inteira.
  let query = supabase
    .from("obras")
    .select(
      "id_acao, nome_acao, numero_automatico, numero_siafe, orgao, status, data_criacao, estagio_atual, percentual_execucao, acao_conveniada"
    );

  if (busca) {
    query = query.or(`nome_acao.ilike.%${busca}%,id_acao.ilike.%${busca}%,orgao.ilike.%${busca}%`);
  }

  if (orgao) {
    query = query.eq("orgao", orgao);
  }

  if (filtro === "vinculada") {
    query = query.not("numero_automatico", "is", null);
  } else if (filtro === "pendente") {
    query = query.is("numero_automatico", null).not("numero_siafe", "is", null);
  } else if (filtro === "sem_numero") {
    query = query.is("numero_automatico", null).is("numero_siafe", null);
  } else if (filtro === "dado_incorreto") {
    query = query.not("numero_siafe", "is", null).not("numero_siafe", "match", "^[0-9]{8}$");
  }

  if (de) query = query.gte("data_criacao", de);
  if (ate) query = query.lte("data_criacao", ate);

  const { data: obras } = await query.order("nome_acao");

  const colunas = [
    "ID da Ação",
    "Nome da Ação",
    "Número Automático",
    "Número do Contrato no SIAFE",
    "Órgão",
    "Status",
    "Data de Criação",
    "Estágio Atual",
    "Percentual de Execução",
    "Ação Conveniada",
  ];

  const linhas = (obras ?? []).map((o) =>
    [
      o.id_acao,
      o.nome_acao,
      o.numero_automatico,
      o.numero_siafe,
      o.orgao,
      o.status,
      o.data_criacao,
      o.estagio_atual,
      o.percentual_execucao,
      o.acao_conveniada,
    ]
      .map(csvEscape)
      .join(";")
  );

  const csv = "﻿" + [colunas.join(";"), ...linhas].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="acoes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

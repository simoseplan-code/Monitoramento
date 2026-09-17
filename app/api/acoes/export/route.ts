import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: obras } = await supabase
    .from("obras")
    .select(
      "id_acao, nome_acao, numero_automatico, numero_siafe, orgao, status, data_criacao, estagio_atual, percentual_execucao, acao_conveniada"
    )
    .order("nome_acao");

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

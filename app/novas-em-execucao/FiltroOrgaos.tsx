"use client";

import { useRouter } from "next/navigation";
import { FiltroCheckbox } from "@/components/FiltroCheckbox";

// Filtro de órgão com caixas de seleção (marca mais de um). Vale pela lista aberta; guarda a escolha no endereço da página.
export function FiltroOrgaos({
  opcoes,
  selecionados,
  baseHref,
  params,
}: {
  opcoes: { valor: string; qtd: number }[];
  selecionados: string[] | null; // null = todos
  baseHref: string;
  /** Os outros parâmetros que precisam continuar no endereço (busca, concluídas...). */
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function mudar(v: Set<string> | null) {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val) q.set(k, val);
    if (v && v.size > 0) q.set("orgaos", Array.from(v).join("|"));
    router.push(`${baseHref}${q.toString() ? `?${q.toString()}` : ""}`);
  }

  return <FiltroCheckbox rotulo="Órgão" opcoes={opcoes} selecionados={selecionados ? new Set(selecionados) : null} aoMudar={mudar} />;
}

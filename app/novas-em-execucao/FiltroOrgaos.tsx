"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Filtro de órgão em "botões" (um por órgão): clique para marcar ou desmarcar, quantos quiser. Responde na hora (a marcação
// fica aqui na tela) e a lista é atualizada logo depois, guardando a escolha no endereço da página. Aberto a toda a equipe.
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
  const chaveDoEndereco = (selecionados ?? []).join("|");
  const [marcados, setMarcados] = useState<string[]>(selecionados ?? []);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se o endereço mudou por outro caminho (outra aba, "voltar"), acompanha.
  useEffect(() => {
    setMarcados(chaveDoEndereco ? chaveDoEndereco.split("|") : []);
  }, [chaveDoEndereco]);
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current);
    },
    []
  );

  function aplicar(novos: string[]) {
    setMarcados(novos);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      const q = new URLSearchParams();
      for (const [k, val] of Object.entries(params)) if (val) q.set(k, val);
      if (novos.length > 0) q.set("orgaos", novos.join("|"));
      router.replace(`${baseHref}${q.toString() ? `?${q.toString()}` : ""}`);
    }, 450);
  }

  const alternar = (valor: string) => aplicar(marcados.includes(valor) ? marcados.filter((o) => o !== valor) : [...marcados, valor]);
  const todos = marcados.length === 0;

  const botao = "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Órgão</span>
      <button type="button" onClick={() => aplicar([])} className={`${botao} ${todos ? "border-series-1 bg-series-1 text-white" : "border-black/10 bg-surface text-ink-secondary hover:bg-plane"}`}>
        Todos
      </button>
      {opcoes.map((o) => {
        const ligado = marcados.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => alternar(o.valor)}
            aria-pressed={ligado}
            className={`${botao} ${ligado ? "border-series-1 bg-series-1/10 text-series-1" : "border-black/10 bg-surface text-ink-secondary hover:bg-plane"}`}
          >
            {o.valor}
            <span className={`tabular rounded-full px-1.5 text-[10px] font-semibold ${ligado ? "bg-series-1/15" : "bg-plane text-ink-muted"}`}>{o.qtd}</span>
          </button>
        );
      })}
    </div>
  );
}

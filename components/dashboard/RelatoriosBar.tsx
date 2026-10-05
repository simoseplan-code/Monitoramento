"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { AjudaCard } from "@/components/AjudaCard";

const TIPOS = [
  { tipo: "completo", rotulo: "Completo", principal: true },
  { tipo: "novas_acoes", rotulo: "Novas Ações" },
  { tipo: "sobreposicoes", rotulo: "Sobreposições" },
  { tipo: "termos", rotulo: "Termos" },
] as const;

type Estado = { gerando: string | null; erro: string | null };

function nomeDoArquivo(resp: Response, padrao: string): string {
  const cab = resp.headers.get("Content-Disposition") ?? "";
  const m = cab.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : padrao;
}

export function RelatoriosBar({ isAdmin }: { isAdmin: boolean }) {
  const [estado, setEstado] = useState<Estado>({ gerando: null, erro: null });

  // Baixa por fetch (e não por link) pra mostrar o motivo quando falhar, em vez
  // de salvar um arquivo .json de erro.
  async function baixar(rota: string, tipo: string, extensao: string) {
    const id = `${rota}|${tipo}`;
    setEstado({ gerando: id, erro: null });
    try {
      const resp = await fetch(`${rota}?tipo=${tipo}`, { credentials: "same-origin" });
      const tipoResp = resp.headers.get("Content-Type") ?? "";
      if (!resp.ok || tipoResp.includes("application/json")) {
        let msg = `Erro ${resp.status}`;
        try {
          const json = await resp.json();
          if (json?.error) msg = `${json.error} (erro ${resp.status})`;
        } catch {
          msg = `Erro ${resp.status} ao gerar o relatório.`;
        }
        setEstado({ gerando: null, erro: msg });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoArquivo(resp, `relatorio-${tipo}.${extensao}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setEstado({ gerando: null, erro: null });
    } catch {
      setEstado({ gerando: null, erro: "Não foi possível falar com o servidor. Tente de novo em instantes." });
    }
  }

  function Grupo({ titulo, icone, rota, extensao, cor }: { titulo: string; icone: React.ReactNode; rota: string; extensao: string; cor: string }) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
          {icone}
          {titulo}
        </span>
        {TIPOS.map((r) => {
          const gerandoEste = estado.gerando === `${rota}|${r.tipo}`;
          return (
            <button
              key={r.tipo}
              onClick={() => baixar(rota, r.tipo, extensao)}
              disabled={estado.gerando !== null}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                "principal" in r && r.principal ? `${cor} text-white hover:opacity-90` : "border border-black/10 text-ink-secondary hover:bg-plane"
              }`}
            >
              {gerandoEste && <Loader2 size={12} className="animate-spin" />}
              {gerandoEste ? "Gerando..." : r.rotulo}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">Relatórios</h2>
        <AjudaCard
          texto={`PDF: relatório visual de uma página por tela (indicadores, gráficos e tabelas), no padrão do painel. "Completo" reúne a visão geral, Novas Ações, Sobreposições, Termos e Unidade/Quantidade/Vinculação${isAdmin ? ", mais o desempenho da equipe" : ""}. Excel: planilha com todos os dados linha a linha (pendências de KML, duplicação e documentos, observações das sobreposições, quem solucionou etc.). Os dois mostram o retrato de agora e podem levar alguns segundos para gerar.`}
        />
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:gap-8">
        <Grupo titulo="PDF" icone={<FileText size={15} className="text-series-2" />} rota="/api/relatorios/pdf" extensao="pdf" cor="bg-series-2" />
        <Grupo titulo="Excel" icone={<FileSpreadsheet size={15} className="text-series-1" />} rota="/api/relatorios" extensao="xlsx" cor="bg-series-1" />
      </div>
      {estado.erro && (
        <p className="rounded-lg bg-status-critical-bg px-3 py-2 text-xs text-status-critical">
          Não foi possível gerar o relatório: {estado.erro}
        </p>
      )}
    </section>
  );
}

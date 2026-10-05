import { FileSpreadsheet, FileText } from "lucide-react";
import { AjudaCard } from "@/components/AjudaCard";

const TIPOS = [
  { tipo: "completo", rotulo: "Completo", principal: true },
  { tipo: "novas_acoes", rotulo: "Novas Ações" },
  { tipo: "sobreposicoes", rotulo: "Sobreposições" },
  { tipo: "termos", rotulo: "Termos" },
] as const;

function Grupo({ titulo, icone, rota, cor }: { titulo: string; icone: React.ReactNode; rota: string; cor: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
        {icone}
        {titulo}
      </span>
      {TIPOS.map((r) => (
        <a
          key={r.tipo}
          href={`${rota}?tipo=${r.tipo}`}
          download
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            "principal" in r && r.principal ? `${cor} text-white hover:opacity-90` : "border border-black/10 text-ink-secondary hover:bg-plane"
          }`}
        >
          {r.rotulo}
        </a>
      ))}
    </div>
  );
}

export function RelatoriosBar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section className="mb-6 space-y-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">Relatórios</h2>
        <AjudaCard
          texto={`PDF: relatório visual de uma página por tela (indicadores, gráficos e tabelas), no padrão do painel. "Completo" reúne a visão geral, Novas Ações, Sobreposições, Termos e Unidade/Quantidade/Vinculação${isAdmin ? ", mais o desempenho da equipe" : ""}. Excel: planilha com todos os dados linha a linha (pendências de KML, duplicação e documentos, observações das sobreposições, quem solucionou etc.). Os dois mostram o retrato de agora e podem levar alguns segundos para gerar.`}
        />
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:gap-8">
        <Grupo titulo="PDF" icone={<FileText size={15} className="text-series-2" />} rota="/api/relatorios/pdf" cor="bg-series-2" />
        <Grupo titulo="Excel" icone={<FileSpreadsheet size={15} className="text-series-1" />} rota="/api/relatorios" cor="bg-series-1" />
      </div>
    </section>
  );
}

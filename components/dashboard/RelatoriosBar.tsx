import { FileSpreadsheet } from "lucide-react";
import { AjudaCard } from "@/components/AjudaCard";

const RELATORIOS = [
  { tipo: "completo", rotulo: "Relatório completo", principal: true },
  { tipo: "novas_acoes", rotulo: "Novas Ações" },
  { tipo: "sobreposicoes", rotulo: "Sobreposições" },
  { tipo: "termos", rotulo: "Termos" },
] as const;

export function RelatoriosBar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={18} className="text-series-1" />
        <h2 className="text-sm font-semibold text-ink-primary">Relatórios em Excel</h2>
        <AjudaCard
          texto={`Baixa uma planilha com o retrato atual do sistema. "Relatório completo" reúne tudo: Novas Ações (pendências de KML, duplicação e documentos, por órgão e por pessoa), Sobreposições (com observações e quem solucionou), Termos, Unidade/Quantidade e Vinculação${isAdmin ? ", mais o histórico de atividades da equipe" : ""}. Os outros botões baixam só aquela tela. Pode levar alguns segundos para gerar.`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {RELATORIOS.map((r) => (
          <a
            key={r.tipo}
            href={`/api/relatorios?tipo=${r.tipo}`}
            download
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              "principal" in r && r.principal
                ? "bg-series-1 text-white hover:opacity-90"
                : "border border-black/10 text-ink-secondary hover:bg-plane"
            }`}
          >
            {r.rotulo}
          </a>
        ))}
      </div>
    </section>
  );
}

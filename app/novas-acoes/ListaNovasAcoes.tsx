"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import { CardNovaAcao, type PessoaEquipe } from "./CardNovaAcao";

type Status = "pendente" | "confirmado" | "aguardando_atualizacao";

export type ItemLista = {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  dataCriacao: string;
  concluido: boolean;
  responsavel: PessoaEquipe | null;
  status: { kml_anexado: Status; sem_duplicacao: Status; documentos_obrigatorios: Status };
};

export function ListaNovasAcoes({
  itens,
  usuario,
  ehAdmin,
  equipe,
}: {
  itens: ItemLista[];
  usuario: PessoaEquipe;
  ehAdmin: boolean;
  equipe: PessoaEquipe[];
}) {
  const router = useRouter();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [pendencia, setPendencia] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const selecionar = useCallback((id: string, marcada: boolean) => {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (marcada) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }, []);

  const registrarPendencia = useCallback((id: string, tem: boolean) => {
    setPendencia((atual) => (atual[id] === tem ? atual : { ...atual, [id]: tem }));
  }, []);

  // Só ações com item pendente e que a pessoa pode mexer entram no "marcar todas".
  const podeMarcar = (i: ItemLista) => pendencia[i.idAcao] && (ehAdmin || !i.responsavel || i.responsavel.id === usuario.id);
  const marcaveis = itens.filter(podeMarcar).map((i) => i.idAcao);
  const todasMarcadas = marcaveis.length > 0 && marcaveis.every((id) => marcadas.has(id));

  async function encaminhar() {
    setEnviando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/revisao/encaminhar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(marcadas), acao: "encaminhar" }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; feitas?: number; ignoradas?: { id: string; motivo: string }[] };
      if (!resp.ok) {
        setAviso({ tipo: "erro", texto: json.error ?? "Não foi possível encaminhar." });
        return;
      }
      const ignoradas = json.ignoradas ?? [];
      setAviso({
        tipo: ignoradas.length > 0 ? "erro" : "ok",
        texto:
          `${json.feitas ?? 0} ação(ões) encaminhada(s) para "Aguardando solução de pendência".` +
          (ignoradas.length > 0 ? ` Não encaminhadas: ${ignoradas.map((x) => `${x.id} (${x.motivo})`).join("; ")}.` : ""),
      });
      setMarcadas(new Set());
      router.refresh();
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      {marcaveis.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={todasMarcadas}
            onChange={(e) => setMarcadas(e.target.checked ? new Set(marcaveis) : new Set())}
            className="h-3.5 w-3.5 accent-status-warning"
          />
          Marcar todas as ações com pendência desta página ({marcaveis.length})
        </label>
      )}

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-status-good-bg text-status-good" : "bg-status-warning-bg text-status-warning"}`}
        >
          {aviso.texto}
        </p>
      )}

      {itens.map((i) => (
        <CardNovaAcao
          key={i.idAcao}
          idAcao={i.idAcao}
          nomeAcao={i.nomeAcao}
          orgao={i.orgao}
          dataCriacao={i.dataCriacao}
          concluido={i.concluido}
          responsavelInicial={i.responsavel}
          usuario={usuario}
          ehAdmin={ehAdmin}
          equipe={equipe}
          statusInicial={i.status}
          selecionada={marcadas.has(i.idAcao)}
          onSelecionar={selecionar}
          onPendencia={registrarPendencia}
        />
      ))}

      {marcadas.size > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warning/30 bg-surface px-4 py-3 shadow-card">
          <p className="text-sm font-medium text-ink-primary">
            {marcadas.size} ação(ões) marcada(s)
            <span className="ml-2 text-xs font-normal text-ink-muted">vão para o grupo do órgão, com os itens marcados como pendentes</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMarcadas(new Set())}
              disabled={enviando}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink-primary disabled:opacity-50"
            >
              <X size={13} /> Limpar
            </button>
            <button
              onClick={encaminhar}
              disabled={enviando}
              className="flex items-center gap-1.5 rounded-full bg-status-warning px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Send size={13} />
              {enviando ? "Encaminhando..." : "Encaminhar para aguardando solução de pendência"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

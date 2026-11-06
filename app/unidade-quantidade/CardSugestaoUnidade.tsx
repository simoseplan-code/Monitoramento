"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Clock, Undo2 } from "lucide-react";
import { UNIDADES_VALIDAS } from "@/lib/unidadeQuantidade/sugestao";
import { IdAcaoLink } from "@/components/IdAcaoLink";

const MARCADOR_MANTER_QUANTIDADE = "vazio = manter a atual do SIMO";

export function CardSugestaoUnidade({
  idAcao,
  nomeAcao,
  orgao,
  tipologia,
  statusAcao,
  unidadeAtual,
  quantidadeAtual,
  unidadeSugerida,
  quantidadeSugerida,
  semQuantidade,
  unidadeFinal,
  quantidadeFinal,
  confianca,
  avisoTipologia,
  motivo,
  aprovado,
  aplicadoEm,
  pendenciaEm = null,
  pendenciaObs = null,
  pendenciaPorNome = null,
}: {
  idAcao: string;
  nomeAcao: string;
  orgao: string | null;
  tipologia: string | null;
  statusAcao: string | null;
  unidadeAtual: string | null;
  quantidadeAtual: string | null;
  unidadeSugerida: string | null;
  quantidadeSugerida: string | null;
  semQuantidade: boolean;
  unidadeFinal: string | null;
  quantidadeFinal: string | null;
  confianca: "alta" | "baixa";
  avisoTipologia: boolean;
  motivo: string;
  aprovado: boolean;
  aplicadoEm: string | null;
  pendenciaEm?: string | null;
  pendenciaObs?: string | null;
  pendenciaPorNome?: string | null;
}) {
  const router = useRouter();
  const bloqueado = !!aplicadoEm;
  // Igual à planilha: ação "Concluído" fica listada só de registro, o
  // SIMO trava a edição dela, então não dá pra aprovar.
  const concluida = /^conclu[ií]do$/i.test((statusAcao ?? "").trim());

  const [unidade, setUnidade] = useState(unidadeFinal || unidadeSugerida || "");
  const [quantidade, setQuantidade] = useState(quantidadeFinal ?? (semQuantidade ? "" : quantidadeSugerida ?? ""));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Jogar para pendência: tira da fila, com um comentário, para analisar depois (aba "Pendências").
  const emPendencia = !!pendenciaEm;
  const [abrindoPendencia, setAbrindoPendencia] = useState(false);
  const [comentario, setComentario] = useState(pendenciaObs ?? "");

  async function pendencia(jogar: boolean) {
    if (jogar && !comentario.trim()) {
      setErro("Escreva um comentário para jogar para pendência.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/unidade/pendencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idAcao, pendencia: jogar, obs: comentario }) });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setErro(data.error ?? "Falha ao salvar a pendência.");
        return;
      }
      setAbrindoPendencia(false);
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(novoAprovado: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/unidade/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAcao, aprovado: novoAprovado, unidadeFinal: unidade, quantidadeFinal: quantidade }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        setErro(data.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  const corBorda = bloqueado
    ? "border-black/5 bg-surface"
    : emPendencia
      ? "border-status-warning/30 bg-status-warning-bg/40"
      : aprovado
      ? "border-status-good/20 bg-status-good-bg"
      : avisoTipologia
        ? "border-series-1/30 bg-series-1/5"
        : "border-black/5 bg-surface";

  return (
    <div className={`rounded-xl border p-4 shadow-card ${corBorda}`}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary">{nomeAcao}</p>
          <p className="text-xs text-ink-muted">
            <IdAcaoLink id={idAcao} /> · {orgao ?? "Sem órgão"} {tipologia ? `· ${tipologia}` : ""}
          </p>
        </div>
        {bloqueado ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-good-bg px-3 py-1.5 text-xs font-medium text-status-good">
            <Check size={13} strokeWidth={3} />
            Aplicado no SIMO
          </span>
        ) : aprovado ? (
          <button
            onClick={() => salvar(false)}
            disabled={salvando}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-status-good hover:bg-white disabled:opacity-50"
            title="Desfazer aprovação"
          >
            <Undo2 size={13} />
            Aprovada, aguardando gravação
          </button>
        ) : emPendencia ? (
          <button
            onClick={() => pendencia(false)}
            disabled={salvando}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-status-warning hover:bg-white disabled:opacity-50"
            title="Devolver esta ação para a fila de análise"
          >
            <Undo2 size={13} />
            Voltar para análise
          </button>
        ) : (
          <button
            onClick={() => setAbrindoPendencia((a) => !a)}
            disabled={salvando}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-status-warning/40 bg-status-warning-bg px-3 py-1.5 text-xs font-semibold text-status-warning hover:opacity-90 disabled:opacity-50"
            title="Tira da fila para analisar depois (fica na aba Pendências, com o seu comentário)"
          >
            <Clock size={13} />
            Jogar para pendência
          </button>
        )}
      </div>

      {abrindoPendencia && !emPendencia && !bloqueado && (
        <div className="mb-3 space-y-2 rounded-lg border border-status-warning/30 bg-status-warning-bg/40 p-3">
          <label className="block text-[11px] uppercase tracking-wide text-status-warning">Comentário da pendência (obrigatório)</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder="Ex.: conferir com o órgão se a medida é em km ou m²"
            className="w-full rounded-lg border border-black/10 bg-surface px-2.5 py-1.5 text-sm text-ink-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={() => pendencia(true)} disabled={salvando || !comentario.trim()} className="flex items-center gap-1.5 rounded-lg bg-status-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              <Clock size={13} />
              Jogar para pendência
            </button>
            <button onClick={() => setAbrindoPendencia(false)} className="text-xs font-medium text-ink-muted hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {emPendencia && (
        <div className="mb-3 rounded-lg border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock size={13} /> Em pendência{pendenciaPorNome ? ` · ${pendenciaPorNome}` : ""}
            {pendenciaEm ? ` · ${new Date(pendenciaEm).toLocaleDateString("pt-BR")}` : ""}
          </p>
          {pendenciaObs && <p className="mt-1 whitespace-pre-wrap text-ink-secondary">{pendenciaObs}</p>}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Unidade atual</p>
          <p className="text-sm font-medium text-ink-primary">{unidadeAtual || "-"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Quantidade atual</p>
          <p className="text-sm font-medium text-ink-primary">{quantidadeAtual || "-"}</p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Sugestão do sistema {unidadeSugerida && <span className="normal-case text-ink-muted/70">(confiança {confianca})</span>}
          </p>
          <p className="text-sm font-medium text-ink-primary">
            {unidadeSugerida ? (
              <>
                {unidadeSugerida}
                {semQuantidade ? "" : quantidadeSugerida ? ` (${quantidadeSugerida})` : ""}
              </>
            ) : (
              <span className="text-ink-muted">Nenhuma, escolha manualmente abaixo</span>
            )}
          </p>
        </div>
      </div>

      <p className="mb-3 flex items-start gap-1.5 text-xs text-ink-secondary">
        {avisoTipologia && <AlertTriangle size={13} className="mt-0.5 shrink-0 text-series-1" />}
        {motivo}
      </p>
      {concluida && !bloqueado && (
        <p className="mb-3 text-xs font-medium text-status-warning">
          Ação concluída, o SIMO trava a edição, fica aqui só de registro (não dá pra aprovar).
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 bg-plane/60 p-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-muted">Vai pro SIMO: Unidade</label>
          <select
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            disabled={bloqueado}
            className="rounded-lg border border-black/10 bg-surface px-2.5 py-1.5 text-sm text-ink-primary disabled:opacity-60"
          >
            {!unidade && <option value="">-- selecione --</option>}
            {UNIDADES_VALIDAS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-muted">Vai pro SIMO: Quantidade</label>
          <input
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={bloqueado}
            placeholder={MARCADOR_MANTER_QUANTIDADE}
            className="w-40 rounded-lg border border-black/10 bg-surface px-2.5 py-1.5 text-sm text-ink-primary placeholder:text-xs disabled:opacity-60"
          />
        </div>

        {!bloqueado && (
          <button
            onClick={() => salvar(true)}
            disabled={salvando || !unidade || concluida}
            title={concluida ? "Ação concluída, o SIMO não permite editar" : !unidade ? "Escolha uma unidade antes de aprovar" : undefined}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Check size={13} />
            {aprovado ? "Salvar alteração" : "Aprovar"}
          </button>
        )}
      </div>
      {erro && <p className="mt-2 text-xs text-status-critical">❌ {erro}</p>}
    </div>
  );
}

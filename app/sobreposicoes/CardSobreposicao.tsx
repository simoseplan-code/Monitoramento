"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Undo2, MapPin, Star, Lock, UserRound, BadgeCheck } from "lucide-react";
import type { ObraNoLocal } from "@/lib/sobreposicoes/parseCsv";
import { IdAcaoLink } from "@/components/IdAcaoLink";

type StatusRevisao = "pendente" | "ok" | "problema" | "solucionado";
type PessoaEquipe = { id: string; nome: string };

// A ação com o menor ID é a mais antiga no SIMO — normalmente a
// "original", que as outras do mesmo local estão duplicando. Vai
// primeiro na lista, marcada como Principal, pra saber qual olhar antes.
function ordenarComPrincipalPrimeiro(obras: ObraNoLocal[]): ObraNoLocal[] {
  return [...obras].sort((a, b) => {
    const idA = a.id ? parseInt(a.id, 10) : Infinity;
    const idB = b.id ? parseInt(b.id, 10) : Infinity;
    return (isNaN(idA) ? Infinity : idA) - (isNaN(idB) ? Infinity : idB);
  });
}

// Texto do status de cada obra: em desenvolvimento mostra o percentual;
// concluída mostra a data (recebimento definitivo, ou o provisório se
// ainda não houver definitivo).
function textoStatus(o: ObraNoLocal): string {
  const status = o.status || "Sem status";
  if (/^conclu[ií]do$/i.test(status.trim())) {
    return o.concluido_em
      ? `Concluído em ${new Date(o.concluido_em + "T00:00:00").toLocaleDateString("pt-BR")}`
      : "Concluído (sem data de recebimento)";
  }
  if (/^em desenvolvimento$/i.test(status.trim()) && o.percentual != null) {
    const pct = (o.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${status} · ${pct}% executado`;
  }
  return status;
}

export function CardSobreposicao({
  chaveLocal,
  obras,
  extensaoM,
  toleranciaM,
  qtdSegmentos,
  latInicio,
  lonInicio,
  latFim,
  lonFim,
  statusInicial,
  observacaoInicial,
  responsavelInicial,
  solucionadoPor: solucionadoPorInicial,
  solucao: solucaoInicial,
  usuario,
  ehAdmin,
  equipe,
}: {
  chaveLocal: string;
  obras: ObraNoLocal[];
  extensaoM: number | null;
  toleranciaM: number | null;
  qtdSegmentos: number | null;
  latInicio: number | null;
  lonInicio: number | null;
  latFim: number | null;
  lonFim: number | null;
  statusInicial: StatusRevisao;
  observacaoInicial: string | null;
  responsavelInicial: PessoaEquipe | null;
  solucionadoPor: { nome: string; em: string | null } | null;
  solucao: string | null;
  usuario: PessoaEquipe;
  ehAdmin: boolean;
  equipe: PessoaEquipe[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(statusInicial);
  const [responsavel, setResponsavel] = useState<PessoaEquipe | null>(responsavelInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [solucionadoPor, setSolucionadoPor] = useState(solucionadoPorInicial);
  const [solucao, setSolucao] = useState(solucaoInicial);
  const [solucaoTexto, setSolucaoTexto] = useState("");
  // Duas confirmações seguidas antes de gravar (qualquer pessoa pode solucionar).
  const [solucionando, setSolucionando] = useState<0 | 1 | 2>(0);
  const [confirmandoVolta, setConfirmandoVolta] = useState(false);
  // Com responsável que não é você, só leitura (admin pode tudo).
  const bloqueado = !!responsavel && responsavel.id !== usuario.id && !ehAdmin;
  // "escrevendo": campo de comentário aberto para a decisão escolhida
  // (ok ou problema) — os dois botões passam pelo mesmo campo.
  const [etapa, setEtapa] = useState<"fechado" | "escrevendo">("fechado");
  const [decisao, setDecisao] = useState<"ok" | "problema">("problema");
  const [observacao, setObservacao] = useState(observacaoInicial ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(novoStatus: StatusRevisao, obs?: string) {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/sobreposicoes/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaveLocal, status: novoStatus, observacao: obs ?? "" }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; responsavelId?: string };
      if (!resp.ok) {
        setErro(json.error ?? "Não foi possível salvar.");
        setEtapa("fechado");
        return;
      }
      if (json.responsavelId && json.responsavelId !== responsavel?.id) {
        setResponsavel(json.responsavelId === usuario.id ? usuario : (equipe.find((p) => p.id === json.responsavelId) ?? responsavel));
      }
      setStatus(novoStatus);
      setEtapa("fechado");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarSolucao(acao: "solucionar" | "voltar") {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/sobreposicoes/solucionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaveLocal, acao, solucao: acao === "solucionar" ? solucaoTexto.trim() : undefined }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setErro(json.error ?? "Não foi possível salvar.");
        setSalvando(false);
        return;
      } else if (acao === "solucionar") {
        setStatus("solucionado");
        setSolucionadoPor({ nome: usuario.nome, em: new Date().toISOString() });
        setSolucao(solucaoTexto.trim());
      } else {
        setStatus("problema");
        setSolucionadoPor(null);
        setSolucao(null);
      }
      setSolucaoTexto("");
      setSolucionando(0);
      setConfirmandoVolta(false);
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  async function trocarResponsavel(usuarioId: string) {
    if (!usuarioId || usuarioId === responsavel?.id) return;
    setTrocando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/revisao/responsavel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: "sobreposicoes", idAcao: chaveLocal, usuarioId }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; responsavelId?: string; responsavelNome?: string };
      if (!resp.ok) setErro(json.error ?? "Não foi possível trocar o responsável.");
      else setResponsavel({ id: json.responsavelId!, nome: json.responsavelNome ?? "—" });
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setTrocando(false);
    }
  }

  const linkMapa =
    latInicio != null && lonInicio != null ? `https://www.google.com/maps?q=${latInicio},${lonInicio}` : null;

  return (
    <div
      className={`rounded-xl border p-4 shadow-card transition-colors ${
        status === "ok"
          ? "border-status-good/20 bg-status-good-bg"
          : status === "problema"
            ? "border-status-warning/20 bg-status-warning-bg"
            : status === "solucionado"
              ? "border-series-7/20 bg-series-7/5"
              : "border-black/5 bg-surface"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-primary">
            {obras.length} obras envolvidas · {extensaoM != null ? `${Math.round(extensaoM)} m` : "—"} sobrepostos
          </p>
          <p className="text-xs text-ink-muted">
            Tolerância {toleranciaM ?? "—"} m · {qtdSegmentos ?? "—"} segmento(s)
            {linkMapa && (
              <>
                {" · "}
                <a href={linkMapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-series-1 hover:underline">
                  <MapPin size={12} /> Ver início no mapa
                </a>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {status === "problema" && solucionando === 0 && (
            <button
              onClick={() => setSolucionando(1)}
              disabled={salvando}
              className="flex items-center gap-1.5 rounded-full bg-series-7 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              title="Qualquer pessoa pode marcar como solucionado"
            >
              <BadgeCheck size={13} />
              Solucionado
            </button>
          )}
          {status === "problema" && solucionando === 1 && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-series-7">
              Esse problema foi solucionado?
              <button onClick={() => setSolucionando(2)} className="rounded-full bg-series-7 px-2 py-0.5 text-white">
                Sim
              </button>
              <button onClick={() => setSolucionando(0)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
                Não
              </button>
            </span>
          )}
          {status === "solucionado" && !confirmandoVolta && (
            <button
              onClick={() => setConfirmandoVolta(true)}
              disabled={salvando}
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-white disabled:opacity-50"
              title="Desfaz a solução e devolve ao responsável"
            >
              <Undo2 size={13} />
              Voltar com problema
            </button>
          )}
          {status === "solucionado" && confirmandoVolta && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-status-warning">
              Voltar com problema? Remove quem solucionou.
              <button
                onClick={() => mudarSolucao("voltar")}
                disabled={salvando}
                className="rounded-full bg-status-warning px-2 py-0.5 text-white disabled:opacity-50"
              >
                {salvando ? "..." : "Sim"}
              </button>
              <button onClick={() => setConfirmandoVolta(false)} className="rounded-full px-1.5 text-ink-muted hover:text-ink-primary">
                Não
              </button>
            </span>
          )}

          {(status === "ok" || status === "problema") && !bloqueado && solucionando === 0 && (
            <button
              onClick={() => salvar("pendente")}
              disabled={salvando}
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-white disabled:opacity-50"
              title="Reabrir revisão"
            >
              <Undo2 size={13} />
              Reabrir
            </button>
          )}
        </div>
      </div>

      <ul className="mb-3 space-y-1.5">
        {ordenarComPrincipalPrimeiro(obras).map((o, i) => (
          <li
            key={i}
            className={`rounded-lg px-3 py-2 text-xs ${i === 0 ? "border border-series-1/30 bg-series-1/5" : "bg-plane"}`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {i === 0 && (
                <span className="flex items-center gap-1 rounded-full bg-series-1 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Star size={10} strokeWidth={3} />
                  Principal
                </span>
              )}
              <span className="rounded-full bg-series-1/10 px-2 py-0.5 text-[11px] font-semibold text-series-1">
                {o.orgao || "Sem órgão"}
              </span>
              <p className="font-medium text-ink-primary">{o.nome}</p>
            </div>
            <p className="text-ink-muted">
              {o.id ? <IdAcaoLink id={o.id}>ID {o.id}</IdAcaoLink> : "Sem ID"}
              {o.estagio ? ` · ${o.estagio}` : ""} · {textoStatus(o)}
              {o.contrato
                ? ` · Contrato ${o.contrato}`
                : o.siafe_nao_vinculado
                  ? ` · SIAFE ${o.siafe_nao_vinculado} (ainda não vinculado)`
                  : " · Sem contrato SIAFE"}
            </p>
          </li>
        ))}
      </ul>

      {status === "problema" && solucionando === 2 && (
        <div className="mb-3 space-y-2 rounded-lg border border-series-7/30 bg-white/70 p-3">
          <p className="text-xs font-semibold text-series-7">Como foi solucionado?</p>
          {observacaoInicial && (
            <p className="text-xs text-ink-muted">
              <strong className="text-status-warning">Problema registrado:</strong> {observacaoInicial}
            </p>
          )}
          <textarea
            value={solucaoTexto}
            onChange={(e) => setSolucaoTexto(e.target.value)}
            placeholder="Descreva o que foi feito para resolver (obrigatório)"
            rows={3}
            maxLength={1000}
            autoFocus
            className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-7 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => mudarSolucao("solucionar")}
              disabled={salvando || solucaoTexto.trim().length < 3}
              className="rounded-full bg-series-7 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Confirmar solucionado"}
            </button>
            <button
              onClick={() => {
                setSolucionando(0);
                setSolucaoTexto("");
              }}
              disabled={salvando}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink-primary"
            >
              Cancelar
            </button>
            <span className="text-[11px] text-ink-muted">Fica no nome de quem confirmar.</span>
          </div>
        </div>
      )}

      {status === "solucionado" && solucionadoPor && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-series-7/20 bg-white/60 px-3 py-2 text-xs text-ink-secondary">
          <BadgeCheck size={13} className="text-series-7" />
          <strong className="text-series-7">Solucionado por {solucionadoPor.nome}</strong>
          {solucionadoPor.em && <> em {new Date(solucionadoPor.em).toLocaleDateString("pt-BR")}</>}
        </p>
      )}

      {status !== "pendente" && observacaoInicial && etapa === "fechado" && (
        <p
          className={`mb-3 rounded-lg border bg-white/60 px-3 py-2 text-xs text-ink-secondary ${
            status === "ok" ? "border-status-good/20" : status === "solucionado" ? "border-series-7/20" : "border-status-warning/20"
          }`}
        >
          <strong className={status === "ok" ? "text-status-good" : "text-status-warning"}>
            {status === "solucionado" ? "Problema:" : "Observação:"}
          </strong>{" "}
          {observacaoInicial}
        </p>
      )}

      {status === "solucionado" && solucao && (
        <p className="mb-3 rounded-lg border border-series-7/20 bg-white/60 px-3 py-2 text-xs text-ink-secondary">
          <strong className="text-series-7">Como foi solucionado:</strong> {solucao}
        </p>
      )}

      {status === "pendente" && etapa === "fechado" && !bloqueado && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDecisao("ok");
              setEtapa("escrevendo");
            }}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-full bg-status-good px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            Sem problema
          </button>
          <button
            onClick={() => {
              setDecisao("problema");
              setEtapa("escrevendo");
            }}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-full bg-status-warning px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle size={13} />
            Tem problema
          </button>
        </div>
      )}

      {etapa === "escrevendo" && (
        <div className="space-y-2">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={decisao === "ok" ? "Comentário sobre a análise (opcional)" : "O que está errado aqui? (opcional)"}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-black/10 bg-plane px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => salvar(decisao, observacao)}
              disabled={salvando}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
                decisao === "ok" ? "bg-status-good" : "bg-status-warning"
              }`}
            >
              {salvando ? "Salvando..." : decisao === "ok" ? "Confirmar sem problema" : "Confirmar problema"}
            </button>
            <button
              onClick={() => setEtapa("fechado")}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          {bloqueado ? <Lock size={12} /> : <UserRound size={12} />}
          {responsavel ? (
            <>
              Responsável: <span className="font-medium text-ink-secondary">{responsavel.nome}</span>
              {responsavel.id === usuario.id && " (você)"}
            </>
          ) : (
            "Sem responsável — quem decidir primeiro assume a análise"
          )}
        </span>

        {ehAdmin && (
          <label className="flex items-center gap-1.5 text-ink-muted">
            Alterar responsável
            <select
              value={responsavel?.id ?? ""}
              disabled={trocando}
              onChange={(e) => trocarResponsavel(e.target.value)}
              className="rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-secondary focus:border-series-1 focus:outline-none disabled:opacity-50"
            >
              {!responsavel && <option value="">— escolher —</option>}
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {erro && <p className="mt-2 rounded-lg bg-status-critical-bg px-3 py-1.5 text-xs text-status-critical">{erro}</p>}
    </div>
  );
}

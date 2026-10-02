import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, CalendarDays, Trophy, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { LazyDesempenhoCharts } from "@/components/desempenho/LazyDesempenhoCharts";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import {
  MODULOS,
  calcularDesempenho,
  calcularSituacao,
  formatarDia,
  type LinhaAgregada,
  type LinhaSituacao,
} from "@/lib/desempenho";

const PERIODOS = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "7", rotulo: "7 dias" },
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
] as const;

// Data de hoje no fuso de Fortaleza (UTC-3, sem horário de verão).
function hojeIso(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function diasAtras(n: number): string {
  return new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; retro?: string }>;
}) {
  const { periodo, de, ate, retro } = await searchParams;
  const incluirRetro = retro !== "0";
  const periodoAtual = de || ate ? "custom" : PERIODOS.some((p) => p.valor === periodo) ? periodo! : "tudo";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single();
  if (!profile?.is_admin) redirect("/");

  let dataDe: string | null = null;
  let dataAte: string | null = null;
  if (periodoAtual === "custom") {
    dataDe = de || null;
    dataAte = ate || null;
  } else if (periodoAtual !== "tudo") {
    dataDe = diasAtras(parseInt(periodoAtual, 10) - 1);
    dataAte = hojeIso();
  }

  const [
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    { data: linhasRpc },
    { data: situacaoRpc },
    { data: sobreposicoesRpc },
    { data: ativos },
  ] = await Promise.all([
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("desempenho_agregado", { data_de: dataDe, data_ate: dataAte }),
    supabase.rpc("desempenho_situacao", { data_de: dataDe, data_ate: dataAte }),
    supabase.rpc("desempenho_sobreposicoes", { data_de: dataDe, data_ate: dataAte }),
    supabase.from("profiles").select("id, nome").eq("status", "aprovado").order("nome"),
  ]);

  const situacao = calcularSituacao((situacaoRpc ?? []) as LinhaSituacao[], (ativos ?? []) as { id: string; nome: string }[]);
  // ok / problema (incluindo os já solucionados) = análises da pessoa como responsável;
  // solucionou = problemas que ela marcou como solucionados.
  const sobreMapa = new Map<string, { ok: number; problema: number; resolvidos: number; solucionou: number }>();
  for (const l of (sobreposicoesRpc ?? []) as { usuario_id: string; situacao: string; total: number }[]) {
    const x = sobreMapa.get(l.usuario_id) ?? { ok: 0, problema: 0, resolvidos: 0, solucionou: 0 };
    const n = Number(l.total);
    if (l.situacao === "ok") x.ok += n;
    else if (l.situacao === "problema") x.problema += n;
    else if (l.situacao === "solucionado_resp") x.problema += n;
    else if (l.situacao === "solucionou") x.solucionou += n;
    sobreMapa.set(l.usuario_id, x);
  }
  const sobreposicoes = ((ativos ?? []) as { id: string; nome: string }[])
    .map((p) => {
      const x = sobreMapa.get(p.id) ?? { ok: 0, problema: 0, resolvidos: 0, solucionou: 0 };
      return { id: p.id, nome: p.nome, ok: x.ok, problema: x.problema, solucionou: x.solucionou, total: x.ok + x.problema };
    })
    .sort((a, b) => b.total + b.solucionou - (a.total + a.solucionou) || a.nome.localeCompare(b.nome));
  const totaisSobre = sobreposicoes.reduce(
    (t, p) => ({ ok: t.ok + p.ok, problema: t.problema + p.problema, solucionou: t.solucionou + p.solucionou, total: t.total + p.total }),
    { ok: 0, problema: 0, solucionou: 0, total: 0 }
  );

  const totaisSituacao = situacao.reduce(
    (t, p) => ({ ok: t.ok + p.ok, pendencia: t.pendencia + p.pendencia, total: t.total + p.ok + p.pendencia }),
    { ok: 0, pendencia: 0, total: 0 }
  );

  const todas = (linhasRpc ?? []) as LinhaAgregada[];
  const temRetro = todas.some((l) => l.retroativo);
  const linhas = incluirRetro ? todas : todas.filter((l) => !l.retroativo);
  const d = calcularDesempenho(linhas);

  function href(mudancas: { periodo?: string; retro?: string }) {
    const params = new URLSearchParams();
    const p = mudancas.periodo ?? (periodoAtual === "custom" ? undefined : periodoAtual);
    if (p && p !== "tudo") params.set("periodo", p);
    if (mudancas.periodo === undefined && periodoAtual === "custom") {
      if (de) params.set("de", de);
      if (ate) params.set("ate", ate);
    }
    const r = mudancas.retro ?? (incluirRetro ? undefined : "0");
    if (r === "0") params.set("retro", "0");
    return `/desempenho${params.toString() ? `?${params.toString()}` : ""}`;
  }

  const campo =
    "rounded-lg border border-black/10 bg-plane px-3 py-2 text-sm text-ink-secondary focus:border-series-1 focus:outline-none";

  return (
    <AppShell
      nome={profile.nome ?? "Usuário"}
      cargo={profile.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Desempenho da equipe"
      subtitulo={
        d.primeiroDia
          ? `${d.totalProdutivo} análises · ${formatarDia(d.primeiroDia)} a ${formatarDia(d.ultimoDia)}`
          : "Nenhum registro no período"
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={href({ periodo: p.valor })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                periodoAtual === p.valor ? "bg-series-1 text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"
              }`}
            >
              {p.rotulo}
            </Link>
          ))}
        </div>

        <form method="get" action="/desempenho" className="flex flex-wrap items-center gap-2">
          {!incluirRetro && <input type="hidden" name="retro" value="0" />}
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            De
            <input type="date" name="de" defaultValue={de ?? ""} className={campo} />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            até
            <input type="date" name="ate" defaultValue={ate ?? ""} className={campo} />
          </label>
          <button
            type="submit"
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              periodoAtual === "custom" ? "bg-series-1 text-white" : "border border-black/10 text-ink-secondary hover:bg-plane"
            }`}
          >
            Aplicar período
          </button>
        </form>

        {temRetro && (
          <Link
            href={href({ retro: incluirRetro ? "0" : "1" })}
            className="ml-auto text-xs text-series-1 hover:underline"
            title="Registros de antes do histórico existir, reconstruídos a partir do último revisor de cada ação"
          >
            {incluirRetro ? "Ocultar histórico retroativo" : "Incluir histórico retroativo"}
          </Link>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Activity} label="Análises feitas" value={d.totalProdutivo} tint="series-1" ajuda="Ações (ou locais) distintas que cada pessoa analisou. Mexer em vários itens do checklist da mesma ação conta uma vez só. Desfazer/reabrir e falhas ficam fora." />
        <StatCard icon={Users} label="Pessoas ativas" value={d.pessoas} tint="good" ajuda="Quantas pessoas fizeram pelo menos uma análise no período." />
        <StatCard icon={CalendarDays} label="Dias com atividade" value={d.diasAtivos} tint="neutral" ajuda="Dias em que houve ao menos uma análise registrada." />
        <StatCard icon={TrendingUp} label="Média por dia ativo" value={d.mediaPorDiaAtivo} tint="series-1" ajuda="Análises feitas divididas pelos dias com atividade." />
        <StatCard
          icon={Trophy}
          label={d.melhorDia ? `Melhor dia · ${formatarDia(d.melhorDia.dia).slice(0, 5)}` : "Melhor dia"}
          value={d.melhorDia?.total ?? 0}
          tint="warning"
          ajuda="Dia com mais análises registradas no período."
        />
        <StatCard icon={AlertTriangle} label="Falhas de gravação" value={d.totalFalhas} tint={d.totalFalhas ? "critical" : "neutral"} ajuda="Tentativas de gravar no SIMO (Unidade/Quantidade e Vinculação) que deram erro." />
      </div>

      {incluirRetro && d.retroativos > 0 && (
        <p className="mb-4 rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          {d.retroativos} das análises são retroativas (de antes do histórico existir): contam 1 por ação, atribuídas à última pessoa que mexeu.
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink-primary">Novas Ações — análises por pessoa</h3>
          <p className="mb-2 text-[11px] leading-snug text-ink-muted">
            1 por ação, na situação de agora. <span className="font-medium text-status-good">Concluída</span>: análise
            finalizada. <span className="font-medium text-status-warning">Pendente</span>: falta resolver algo (item
            laranja); ao resolver, passa para concluída.
          </p>
          <table className="w-full text-xs">
            <thead className="border-b border-black/5 text-left uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2 py-1.5">Pessoa</th>
                <th className="px-2 py-1.5 text-right text-status-good">Concluída</th>
                <th className="px-2 py-1.5 text-right text-status-warning">Pendente</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {situacao.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0">
                  <td className="truncate px-2 py-1 font-medium text-ink-primary">{p.nome}</td>
                  <td className="tabular px-2 py-1 text-right font-semibold text-status-good">{p.ok || "—"}</td>
                  <td className="tabular px-2 py-1 text-right font-semibold text-status-warning">{p.pendencia || "—"}</td>
                  <td className="tabular px-2 py-1 text-right text-ink-primary">{p.ok + p.pendencia || "—"}</td>
                </tr>
              ))}
              {situacao.length > 0 && (
                <tr className="border-t-2 border-black/10 bg-plane/60 font-semibold">
                  <td className="px-2 py-1 text-ink-primary">Total</td>
                  <td className="tabular px-2 py-1 text-right text-status-good">{totaisSituacao.ok}</td>
                  <td className="tabular px-2 py-1 text-right text-status-warning">{totaisSituacao.pendencia}</td>
                  <td className="tabular px-2 py-1 text-right text-ink-primary">{totaisSituacao.total}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink-primary">Sobreposições — análises por pessoa</h3>
          <p className="mb-2 text-[11px] leading-snug text-ink-muted">
            1 por local. <span className="font-medium text-status-warning">Com problema</span>: fica para verificação
            posterior; continua contando aqui depois de solucionado. <span className="font-medium text-status-good">Sem problema</span>: não se configura
            como sobreposição. <span className="font-medium text-series-7">Solucionou</span>: problemas que a pessoa marcou
            como solucionados.
          </p>
          <table className="w-full text-xs">
            <thead className="border-b border-black/5 text-left uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2 py-1.5">Pessoa</th>
                <th className="px-2 py-1.5 text-right text-status-warning">Com problema</th>
                <th className="px-2 py-1.5 text-right text-status-good">Sem problema</th>
                <th className="px-2 py-1.5 text-right text-series-7">Solucionou</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sobreposicoes.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0">
                  <td className="truncate px-2 py-1 font-medium text-ink-primary">{p.nome}</td>
                  <td className="tabular px-2 py-1 text-right font-semibold text-status-warning">{p.problema || "—"}</td>
                  <td className="tabular px-2 py-1 text-right font-semibold text-status-good">{p.ok || "—"}</td>
                  <td className="tabular px-2 py-1 text-right font-semibold text-series-7">{p.solucionou || "—"}</td>
                  <td className="tabular px-2 py-1 text-right text-ink-primary">{p.total || "—"}</td>
                </tr>
              ))}
              {sobreposicoes.length > 0 && (
                <tr className="border-t-2 border-black/10 bg-plane/60 font-semibold">
                  <td className="px-2 py-1 text-ink-primary">Total</td>
                  <td className="tabular px-2 py-1 text-right text-status-warning">{totaisSobre.problema}</td>
                  <td className="tabular px-2 py-1 text-right text-status-good">{totaisSobre.ok}</td>
                  <td className="tabular px-2 py-1 text-right text-series-7">{totaisSobre.solucionou}</td>
                  <td className="tabular px-2 py-1 text-right text-ink-primary">{totaisSobre.total}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <LazyDesempenhoCharts d={d} />

      <section className="mt-4 rounded-xl border border-black/5 bg-surface p-5 shadow-card">
        <h3 className="text-sm font-semibold text-ink-primary">Detalhe por pessoa</h3>
        <p className="mb-3 text-xs text-ink-muted">
          Ações/locais distintos analisados por cada pessoa em cada tela. É um histórico do que foi feito: continua contando
          mesmo que a análise tenha sido refeita ou apagada depois.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Pessoa</th>
                {MODULOS.map((m) => (
                  <th key={m.chave} className="px-3 py-2 text-right">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: m.cor }} />
                    {m.nome}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Dias ativos</th>
                <th className="px-3 py-2 text-right">Média/dia</th>
                <th className="px-3 py-2 text-right">Falhas</th>
                <th className="px-3 py-2 text-right">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {d.porPessoa.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink-primary">{p.nome}</td>
                  {MODULOS.map((m) => (
                    <td key={m.chave} className="tabular px-3 py-2 text-right text-ink-secondary">
                      {p.porModulo[m.chave] ?? "—"}
                    </td>
                  ))}
                  <td className="tabular px-3 py-2 text-right font-semibold text-ink-primary">{p.total}</td>
                  <td className="tabular px-3 py-2 text-right text-ink-secondary">{p.diasAtivos}</td>
                  <td className="tabular px-3 py-2 text-right text-ink-secondary">{p.mediaPorDiaAtivo}</td>
                  <td className={`tabular px-3 py-2 text-right ${p.falhas ? "text-status-critical" : "text-ink-muted"}`}>{p.falhas || "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-ink-secondary">{formatarDia(p.ultimoDia)}</td>
                </tr>
              ))}
              {d.porPessoa.length === 0 && (
                <tr>
                  <td colSpan={MODULOS.length + 6} className="px-3 py-8 text-center text-sm text-ink-muted">
                    Nenhum registro no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

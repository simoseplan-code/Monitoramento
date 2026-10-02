import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, CalendarDays, Trophy, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { LazyDesempenhoCharts } from "@/components/desempenho/LazyDesempenhoCharts";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { MODULOS, calcularDesempenho, formatarDia, type LinhaAgregada } from "@/lib/desempenho";

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

  const [{ count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: linhasRpc }] = await Promise.all([
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("desempenho_agregado", { data_de: dataDe, data_ate: dataAte }),
  ]);

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

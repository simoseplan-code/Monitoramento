import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import Link from "next/link";

function classificar(row: { numero_automatico: string | null; numero_siafe: string | null }) {
  if (row.numero_automatico) return "vinculada";
  if (row.numero_siafe) return "pendente";
  return "sem_numero";
}

function siafeValido(numero: string | null) {
  return !!numero && /^\d{8}$/.test(numero.trim());
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, is_admin")
    .eq("id", user!.id)
    .single();

  const { data: obras } = await supabase
    .from("obras")
    .select("id_acao, nome_acao, numero_automatico, numero_siafe, orgao, status, estagio_atual")
    .order("nome_acao")
    .limit(500);

  const linhas = obras ?? [];
  const total = linhas.length;
  const vinculadas = linhas.filter((r) => classificar(r) === "vinculada").length;
  const pendentes = linhas.filter((r) => classificar(r) === "pendente").length;
  const semNumero = total - vinculadas - pendentes;
  const dadoIncorreto = linhas.filter((r) => r.numero_siafe && !siafeValido(r.numero_siafe)).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoramento de Obras</h1>
          <p className="text-sm text-slate-500">Olá, {profile?.nome}</p>
        </div>
        <div className="flex items-center gap-4">
          {profile?.is_admin && (
            <Link href="/admin" className="text-sm font-medium underline">
              Administração
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total de Ações" valor={total} cor="text-slate-900" />
        <Kpi label="Vinculadas ao SIAFE" valor={vinculadas} cor="text-emerald-700" />
        <Kpi label="Pendentes de Vinculação" valor={pendentes} cor="text-amber-700" />
        <Kpi label="Dado Incorreto" valor={dadoIncorreto} cor="text-red-700" />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ações pendentes de vinculação</h2>
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Órgão</th>
                <th className="px-3 py-2">Nº SIAFE</th>
                <th className="px-3 py-2">Estágio</th>
              </tr>
            </thead>
            <tbody>
              {linhas
                .filter((r) => classificar(r) === "pendente")
                .map((r) => (
                  <tr key={r.id_acao} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium">{r.id_acao}</td>
                    <td className="px-3 py-2">{r.nome_acao}</td>
                    <td className="px-3 py-2">{r.orgao}</td>
                    <td className={`px-3 py-2 ${siafeValido(r.numero_siafe) ? "" : "text-red-600"}`}>
                      {r.numero_siafe}
                    </td>
                    <td className="px-3 py-2">{r.estagio_atual}</td>
                  </tr>
                ))}
              {semNumero + pendentes === 0 && total === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Nenhum dado sincronizado ainda. Aguarde a próxima execução do cron ou dispare manualmente em Administração.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

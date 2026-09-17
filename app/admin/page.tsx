import { createClient } from "@/lib/supabase/server";
import { AprovarBotoes } from "./AprovarBotoes";
import { SincronizarBotao } from "./SincronizarBotao";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: pendentes } = await supabase
    .from("profiles")
    .select("id, nome, email, created_at")
    .eq("status", "pendente")
    .order("created_at");

  const { data: ultimosSyncs } = await supabase
    .from("sync_log")
    .select("executado_em, sucesso, linhas_processadas, mensagem")
    .order("executado_em", { ascending: false })
    .limit(5);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Administração</h1>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sincronização com o SIMO</h2>
          <SincronizarBotao />
        </div>
        <ul className="space-y-1 text-sm text-slate-600">
          {(ultimosSyncs ?? []).map((s, i) => (
            <li key={i}>
              {new Date(s.executado_em).toLocaleString("pt-BR")} —{" "}
              {s.sucesso ? `✅ ${s.linhas_processadas} ações` : `❌ ${s.mensagem}`}
            </li>
          ))}
          {(!ultimosSyncs || ultimosSyncs.length === 0) && <li>Nenhuma sincronização registrada ainda.</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cadastros pendentes de aprovação</h2>
        <div className="space-y-2">
          {(pendentes ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border border-slate-200 p-3">
              <div>
                <p className="font-medium">{p.nome}</p>
                <p className="text-sm text-slate-500">{p.email}</p>
              </div>
              <AprovarBotoes userId={p.id} />
            </div>
          ))}
          {(!pendentes || pendentes.length === 0) && (
            <p className="text-sm text-slate-500">Nenhum cadastro pendente.</p>
          )}
        </div>
      </section>
    </main>
  );
}

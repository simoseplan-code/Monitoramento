import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { ConfiguracaoTd, type AcaoInfo, type Mae } from "./ConfiguracaoTd";

export default async function ConfiguracaoTdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: maes }, { data: filhas }] =
    await Promise.all([
      supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      contarNovasAcoesPendentes(supabase),
      supabase.from("td_acoes_mae").select("id_acao, criado_em").order("criado_em"),
      supabase.from("td_acoes_filha").select("id_acao, id_acao_mae, criado_em").order("criado_em"),
    ]);

  // Configuração é só para admin e chefe.
  if (!profile?.is_admin) redirect("/");

  // Dados de cada ação (nome, órgão, status) vêm da base sincronizada, buscados por ID em blocos.
  const ids = Array.from(new Set([...(maes ?? []).map((m) => m.id_acao), ...(filhas ?? []).map((f) => f.id_acao)]));
  const infoPorId: Record<string, AcaoInfo> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("obras")
      .select("id_acao, nome_acao, orgao, status, estagio_atual")
      .in("id_acao", ids.slice(i, i + 200));
    for (const o of data ?? []) {
      infoPorId[o.id_acao] = { nome: o.nome_acao, orgao: o.orgao, status: o.status, estagio: o.estagio_atual };
    }
  }

  const lista: Mae[] = (maes ?? []).map((m) => ({
    id: m.id_acao,
    filhas: (filhas ?? []).filter((f) => f.id_acao_mae === m.id_acao).map((f) => f.id_acao),
  }));

  return (
    <AppShell
      nome={profile.nome ?? "Usuário"}
      cargo={profile.cargo}
      isAdmin
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Configuração de TD"
      subtitulo={`${lista.length} ação(ões) mãe, ${(filhas ?? []).length} ação(ões) filha(s)`}
    >
      <ConfiguracaoTd maes={lista} info={infoPorId} />
    </AppShell>
  );
}

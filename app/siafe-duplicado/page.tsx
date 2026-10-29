import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { idsDesconsiderados } from "@/lib/desconsideradas";
import { SiafeDuplicado, type GrupoSiafe } from "./SiafeDuplicado";

type Linha = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  numero_siafe: string | null;
  numero_automatico: string | null;
  data_criacao: string | null;
};

// Aberta a toda a equipe aprovada: ações que usam o MESMO número de contrato no SIAFE.
export default async function SiafeDuplicadoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, fora] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    // IDs que a equipe desconsiderou (lista desta análise + lista "Todas").
    idsDesconsiderados(supabase, "siafe_duplicado"),
  ]);

  const linhas: Linha[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("obras")
      .select("id_acao, nome_acao, orgao, status, estagio_atual, numero_siafe, numero_automatico, data_criacao")
      .not("numero_siafe", "is", null)
      .order("id_acao")
      .range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const desconsiderados = new Set(fora);
  const porSiafe = new Map<string, GrupoSiafe["acoes"]>();
  for (const l of linhas) {
    const numero = (l.numero_siafe ?? "").trim();
    if (!numero || numero === "-" || desconsiderados.has(l.id_acao)) continue;
    const lista = porSiafe.get(numero) ?? [];
    lista.push({
      id: l.id_acao,
      nome: l.nome_acao ?? "",
      orgao: l.orgao,
      status: l.status,
      estagio: l.estagio_atual,
      vinculada: !!l.numero_automatico,
      criadaEm: l.data_criacao,
    });
    porSiafe.set(numero, lista);
  }
  // Só os números que aparecem em mais de uma ação.
  const grupos: GrupoSiafe[] = Array.from(porSiafe, ([siafe, acoes]) => ({ siafe, acoes }))
    .filter((g) => g.acoes.length > 1)
    .sort((a, b) => b.acoes.length - a.acoes.length || a.siafe.localeCompare(b.siafe, "pt-BR", { numeric: true }));
  const totalAcoesRepetidas = grupos.reduce((s, g) => s + g.acoes.length, 0);

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="SIAFE duplicado"
      subtitulo={`${grupos.length.toLocaleString("pt-BR")} número(s) de SIAFE em mais de uma ação · ${totalAcoesRepetidas.toLocaleString("pt-BR")} ação(ões)`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar as ações: {erro}</p>
      ) : (
        <SiafeDuplicado grupos={grupos} desconsideradas={fora.length} />
      )}
    </AppShell>
  );
}

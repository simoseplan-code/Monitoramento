import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { idsDaLista } from "@/lib/desconsideradas";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiafeDuplicado, type AcaoDoGrupo, type GrupoSiafe } from "./SiafeDuplicado";

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

const limpo = (v: string | null) => {
  const s = (v ?? "").trim();
  return s && s !== "-" ? s : null;
};

// Aberta a toda a equipe aprovada: ações que usam o MESMO número de SIAFE, em dois campos separados:
//  - SIAFE automático (numero_automatico): o número que vincula a ação ao SIAFE;
//  - SIAFE escrito (numero_siafe): o número digitado à mão no SIMO.
export default async function SiafeDuplicadoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, jaDesconsideradasLista] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    // Só para marcar: esta tela NÃO tira as ações desconsideradas, é aqui que se acham as que vão ser desconsideradas.
    idsDaLista(supabase, "todas"),
  ]);

  const baseCompleta = createAdminClient();
  const linhas: Linha[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    // Lê a base completa (sem o filtro de "Todas as análises"): aqui se vê justamente o que ainda vai ser desconsiderado.
    const { data, error } = await baseCompleta
      .from("obras")
      .select("id_acao, nome_acao, orgao, status, estagio_atual, numero_siafe, numero_automatico, data_criacao")
      .or("numero_siafe.not.is.null,numero_automatico.not.is.null")
      .order("id_acao")
      .range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const jaDesconsideradas = new Set(jaDesconsideradasLista);
  const paraAcao = (l: Linha): AcaoDoGrupo => ({
    id: l.id_acao,
    nome: l.nome_acao ?? "",
    orgao: l.orgao,
    status: l.status,
    estagio: l.estagio_atual,
    siafeEscrito: limpo(l.numero_siafe),
    siafeAutomatico: limpo(l.numero_automatico),
    criadaEm: l.data_criacao,
    desconsiderada: jaDesconsideradas.has(l.id_acao),
  });

  // Só os números que aparecem em mais de uma ação, em cada campo.
  const agrupar = (valorDe: (l: Linha) => string | null): GrupoSiafe[] => {
    const porNumero = new Map<string, AcaoDoGrupo[]>();
    for (const l of linhas) {
      const numero = valorDe(l);
      if (!numero) continue;
      const lista = porNumero.get(numero) ?? [];
      lista.push(paraAcao(l));
      porNumero.set(numero, lista);
    }
    return Array.from(porNumero, ([siafe, acoes]) => ({ siafe, acoes }))
      .filter((g) => g.acoes.length > 1)
      .sort((a, b) => b.acoes.length - a.acoes.length || a.siafe.localeCompare(b.siafe, "pt-BR", { numeric: true }));
  };
  const automatico = agrupar((l) => limpo(l.numero_automatico));
  const escrito = agrupar((l) => limpo(l.numero_siafe));

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="SIAFE duplicado"
      subtitulo={`${automatico.length.toLocaleString("pt-BR")} repetido(s) no SIAFE automático · ${escrito.length.toLocaleString("pt-BR")} repetido(s) no SIAFE escrito`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar as ações: {erro}</p>
      ) : (
        <SiafeDuplicado automatico={automatico} escrito={escrito} />
      )}
    </AppShell>
  );
}

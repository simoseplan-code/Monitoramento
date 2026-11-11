import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/layout/AppShell";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { territoriosDasAcoes, territorioPorMunicipio } from "@/lib/territoriosDados";
import { normalizarNome } from "@/lib/territorios";
import type { AcaoT } from "@/lib/analiseTerritorio";
import { dinheiroParaNumero } from "@/lib/simo/parseCsv";
import { ehRecursoHidrico } from "@/lib/hidricos";
import { idsDaLista } from "@/lib/desconsideradas";
import { AnaliseTerritorio } from "./AnaliseTerritorio";

const COLUNAS =
  "id_acao, nome_acao, orgao, status, estagio_atual, tipologia, classificacao, tipo_outros_documentos, acao_conveniada, percentual_execucao, numero_automatico, numero_siafe, data_criacao, data_receb_definitivo, data_receb_provisorio, valor_original, valor_total, unidade_medida, quantidade, extra, eixo:extra->>EIXO";

type Linha = {
  id_acao: string;
  nome_acao: string | null;
  orgao: string | null;
  status: string | null;
  estagio_atual: string | null;
  tipologia: string | null;
  classificacao: string | null;
  tipo_outros_documentos: string | null;
  acao_conveniada: string | null;
  percentual_execucao: number | string | null;
  numero_automatico: string | null;
  numero_siafe: string | null;
  data_criacao: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  valor_original: number | string | null;
  valor_total: number | string | null;
  unidade_medida: string | null;
  quantidade: number | string | null;
  eixo: string | null;
  extra: Record<string, string> | null;
};

const numero = (v: number | string | null): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
// VALOR PAGO TOTAL vem do relatório do SIMO; enquanto não é uma coluna própria, fica em "extra" (cabeçalho como no SIMO).
function valorPagoDe(extra: Record<string, string> | null): number | null {
  if (!extra) return null;
  const chave = Object.keys(extra).find((k) => /valor\s*pago/i.test(k));
  return chave ? dinheiroParaNumero(extra[chave]) : null;
}

const limpo = (v: string | null) => {
  const s = (v ?? "").trim();
  return s && s !== "-" ? s : null;
};

// Colunas "Localização (município)" e "Localização (território)" do relatório do SIMO (ficam em "extra", cabeçalho como no SIMO).
function localizacaoSimo(extra: Record<string, string> | null): { municipio: string | null; territorio: string | null } {
  if (!extra) return { municipio: null, territorio: null };
  const chaves = Object.keys(extra);
  const chM = chaves.find((k) => /localiza/i.test(k) && /munic/i.test(k)) ?? chaves.find((k) => /munic/i.test(k) && !/bairro/i.test(k));
  const chT = chaves.find((k) => /localiza/i.test(k) && /territ/i.test(k)) ?? chaves.find((k) => /territ/i.test(k));
  return { municipio: chM ? limpo(extra[chM]) : null, territorio: chT ? limpo(extra[chT]) : null };
}

// O SIMO junta vários valores na mesma célula com " - " (ex.: "TERESINA - UNIÃO - ALTOS", "Entre Rios - Entre Rios"): separa e tira os repetidos.
function separarSimo(v: string | null): string[] {
  if (!v) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const parte of v.split(/\s+-\s+|\s*;\s*/)) {
    const nome = parte.trim();
    const chave = normalizarNome(nome);
    if (nome && nome !== "-" && !vistos.has(chave)) {
      vistos.add(chave);
      saida.push(nome);
    }
  }
  return saida;
}

// Aberta a toda a equipe aprovada. Todas as ações (as desconsideradas em "Todas as análises" já ficam de fora pelo banco).
// Serve a três páginas: "Análise por território", "Mapa geral" (só o mapa de traçados, com os mesmos filtros) e
// "Mapa de Recursos Hídricos" (igual ao Mapa geral, só com as tipologias de recursos hídricos; é a única tela da função DIGEPI).
export async function PaginaTerritorio({ modo }: { modo: "analise" | "mapa" | "hidricos" }) {
  const hidricos = modo === "hidricos";
  const tela = hidricos ? "recursos_hidricos" : modo === "mapa" ? "mapa_geral" : "analise_territorio";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("nome, cargo, is_admin, status").eq("id", user!.id).single();
  const digepi = profile?.status === "digepi";
  // Mapa geral (traçado de todas as obras): só admin e chefe.
  if (modo === "mapa" && !profile?.is_admin) redirect("/");
  // Recursos Hídricos: os dados vêm do servidor, já só com as tipologias de recursos hídricos (a pessoa DIGEPI não lê nada direto do banco).
  const dados = hidricos ? createAdminClient() : supabase;
  let totalAcoes: number | null = 0;
  let pendentesAprovacao: number | null = 0;
  let novasAcoesPendentes = 0;
  if (!hidricos) {
    const [a, b, c] = await Promise.all([
      supabase.from("obras").select("id_acao", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      contarNovasAcoesPendentes(supabase),
    ]);
    totalAcoes = a.count;
    pendentesAprovacao = b.count;
    novasAcoesPendentes = c;
  }

  const linhas: Linha[] = [];
  let erro: string | null = null;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await dados.from("obras").select(COLUNAS).order("id_acao").range(de, de + 999);
    if (error) {
      erro = error.message;
      break;
    }
    linhas.push(...((data ?? []) as unknown as Linha[]));
    if (!data || data.length < 1000) break;
  }
  if (hidricos) {
    // Só recursos hídricos, e sem as ações que a equipe desconsiderou em "Todas as análises".
    const fora = new Set(await idsDaLista(createAdminClient(), "todas"));
    for (let i = linhas.length - 1; i >= 0; i--) if (!ehRecursoHidrico(linhas[i].tipologia) || fora.has(linhas[i].id_acao)) linhas.splice(i, 1);
  }

  const extras = new Map<string, Record<string, string> | null>(linhas.map((l) => [l.id_acao, l.extra]));
  const { porAcao, erro: erroTerr } = await territoriosDasAcoes(dados, extras);
  erro = erro ?? erroTerr;
  const mapaMunicipios = await territorioPorMunicipio();
  const territorios = Array.from(new Set(mapaMunicipios.values())).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Filtro gravado: UM SÓ, vale para todos (quem gravou por último). Lido com o acesso do servidor.
  const admin = createAdminClient();
  const { data: gravado } = await admin.from("filtros_salvos").select("usuario_id, estado, atualizado_em").eq("tela", tela).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  let gravadoPor: string | null = null;
  if (gravado?.usuario_id) {
    const { data: quem } = await admin.from("profiles").select("nome").eq("id", gravado.usuario_id).maybeSingle();
    gravadoPor = (quem?.nome as string | null) ?? null;
  }
  const filtroGravado = gravado ? { estado: gravado.estado as unknown, atualizadoEm: gravado.atualizado_em as string, por: gravadoPor } : null;

  const acoes: AcaoT[] = linhas.map((l) => {
    const t = porAcao.get(l.id_acao);
    const loc = localizacaoSimo(l.extra);
    return {
      id: l.id_acao,
      nome: l.nome_acao ?? "",
      orgao: l.orgao,
      status: l.status,
      estagio: l.estagio_atual,
      tipologia: l.tipologia,
      unidade: limpo(l.unidade_medida),
      quantidade: numero(l.quantidade),
      classificacao: l.classificacao,
      eixo: limpo(l.eixo),
      tipoOutros: l.tipo_outros_documentos,
      conveniada: l.acao_conveniada,
      pct: numero(l.percentual_execucao),
      numeroAutomatico: limpo(l.numero_automatico),
      numeroSiafe: limpo(l.numero_siafe),
      criadaEm: l.data_criacao,
      recDef: l.data_receb_definitivo,
      recProv: l.data_receb_provisorio,
      original: numero(l.valor_original),
      total: numero(l.valor_total),
      pago: valorPagoDe(l.extra),
      partes: t?.partes ?? [],
      municipios: t?.municipios ?? [],
      origem: t?.origem ?? "nenhuma",
      extensaoM: t?.extensaoM ?? 0,
      simoMunicipio: loc.municipio,
      simoTerritorio: loc.territorio,
      simoMunicipiosLista: separarSimo(loc.municipio).map((nome) => ({ nome, territorio: mapaMunicipios.get(normalizarNome(nome)) ?? null })),
      simoTerritoriosLista: separarSimo(loc.territorio),
    };
  });

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      digepi={digepi}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo={hidricos ? "Mapa de Recursos Hídricos" : modo === "mapa" ? "Mapa geral" : "Análise geral"}
      subtitulo={hidricos ? `Adutora, barragem, abastecimento de água, cisterna, poço e rede de distribuição · ${acoes.length.toLocaleString("pt-BR")} ação(ões)` : modo === "mapa" ? `Traçados (KML) das ações, com os filtros que você escolher · ${acoes.length.toLocaleString("pt-BR")} ação(ões)` : `${acoes.length.toLocaleString("pt-BR")} ação(ões) nos 12 territórios de desenvolvimento`}
    >
      {erro ? (
        <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar os dados: {erro}</p>
      ) : (
        <AnaliseTerritorio acoes={acoes} territorios={territorios} territorioDoMunicipio={Object.fromEntries(mapaMunicipios)} filtroGravado={filtroGravado} ehAdmin={!!profile?.is_admin} modo={modo} tela={tela} somenteLeitura={digepi} />
      )}
    </AppShell>
  );
}

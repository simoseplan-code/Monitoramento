import { createAdminClient } from "@/lib/supabase/admin";
import { idsDeListas } from "@/lib/desconsideradas";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAnalise } from "@/lib/analisesLog";
import { buscarBoletins } from "@/lib/simo/medicoes";
import { dinheiroParaNumero, csvParaObras } from "@/lib/simo/parseCsv";

// Endpoint que efetivamente cria o vínculo de contrato SIAFE numa ação
// (o que acontece ao clicar "Vincular Contrato" → colar o código →
// Salvar, no SIMO). Diferente do formulário "Geral" usado por
// lib/simo/formulario.ts, aqui o SIMO responde com um JSON simples
// { status: "success" | "error", message }, sempre em HTTP 200.
const SIMO_CONTRACTS_STORE_URL = "http://simo.pi.gov.br/cahier/action/projects/contracts/store";

// Pausa entre cada vinculação, mesmo valor do script original, pra não
// sobrecarregar o SIMO com escritas seguidas.
const PAUSA_MS = 600;
// Corta com folga antes do limite de execução da rota (maxDuration em
// app/api/admin/vincular/route.ts); quem chamou vê quantas restam e
// pode rodar de novo pra continuar de onde parou.
const LIMITE_TEMPO_MS = 45_000;

type ObraCandidata = { id_acao: string; nome_acao: string; numero_siafe: string; orgao: string | null; status: string | null };

async function vincularContratoSiafe(cookie: string, idAcao: string, numero: string): Promise<{ httpCode: number; texto: string }> {
  const resp = await fetch(SIMO_CONTRACTS_STORE_URL, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `http://simo.pi.gov.br/cahier/action/projects/show/id/${idAcao}`,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ project_id: idAcao, numero_contrato_siafe: numero }),
  });
  const buffer = Buffer.from(await resp.arrayBuffer());
  const texto = new TextDecoder("iso-8859-1").decode(buffer);
  return { httpCode: resp.status, texto };
}

// Uma tentativa completa: chama o SIMO, registra no log de auditoria e
// grava o resultado na própria obra, sucesso limpa o erro guardado,
// falha guarda o motivo + o número tentado (pra "Vincular todas" não
// insistir no mesmo erro até o número mudar). Compartilhado entre o
// lote e o retry individual, pra não ter duas implementações do mesmo
// fluxo divergindo com o tempo.
async function tentarVincular(
  admin: SupabaseClient,
  cookie: string,
  obra: ObraCandidata,
  executadoPor: string
): Promise<{ resultado: string; sucesso: boolean }> {
  let httpCode: number | null = null;
  let textoResp = "";
  let resultado: string;
  let sucesso = false;

  try {
    const r = await vincularContratoSiafe(cookie, obra.id_acao, obra.numero_siafe.trim());
    httpCode = r.httpCode;
    textoResp = r.texto;
    // O SIMO sempre responde HTTP 200, mesmo em erro, o resultado real
    // vem no campo "status" do JSON.
    let parsed: { status?: string; message?: string } | null = null;
    try {
      parsed = JSON.parse(textoResp);
    } catch {
      // resposta não é JSON
    }

    if (parsed?.status === "success") {
      resultado = "Sucesso";
      sucesso = true;
    } else if (parsed?.status === "error") {
      resultado = parsed.message || "Erro desconhecido";
    } else {
      resultado = `Resposta inesperada (HTTP ${httpCode})`;
    }
  } catch (e) {
    resultado = `Erro: ${e instanceof Error ? e.message : "desconhecido"}`;
  }

  await admin.from("obras_vinculacao_log").insert({
    id_acao: obra.id_acao,
    nome_acao: obra.nome_acao,
    numero_siafe: obra.numero_siafe,
    http_code: httpCode,
    resultado,
    resposta_bruta: textoResp.slice(0, 2000),
    executado_por: executadoPor,
  });

  await admin
    .from("obras")
    .update(
      sucesso
        ? { vinculacao_ultimo_erro: null, vinculacao_numero_tentado: null, vinculacao_falhou_em: null }
        : { vinculacao_ultimo_erro: resultado, vinculacao_numero_tentado: obra.numero_siafe, vinculacao_falhou_em: new Date().toISOString() }
    )
    .eq("id_acao", obra.id_acao);

  await registrarAnalise(admin, executadoPor, "vinculacao", obra.id_acao, sucesso ? "vinculado" : "falha_vinculacao", resultado);

  return { resultado, sucesso };
}

export type ResultadoVinculacao = {
  sucesso: number;
  falha: number;
  restantes: number;
  detalhes: { idAcao: string; nomeAcao: string; resultado: string }[];
};

// Vincula toda ação pendente com Número do Contrato no SIAFE válido (8
// dígitos), órgão diferente de AGESPISA (não possui SIAFE), status
// diferente de "Cancelado", E que não tenha falhado antes com esse
// MESMO número (mesmo critério de contar_vinculacao_pendentes_validas,
// 0018), evita reprocessar em massa um erro que só se resolve com
// correção manual no SIMO.
// `tentarTodas`: também tenta de novo as que já falharam com o mesmo número (a pessoa pediu para insistir). Vai das tentadas
// há mais tempo para as mais recentes, então rodar de novo continua de onde parou em vez de repetir as mesmas.
export async function executarVinculacaoLote(executadoPor: string, tentarTodas = false): Promise<ResultadoVinculacao> {
  const admin = createAdminClient();
  const inicio = Date.now();

  const { data: obras, error } = await admin
    .from("obras")
    .select("id_acao, nome_acao, numero_siafe, orgao, status, vinculacao_ultimo_erro, vinculacao_numero_tentado, vinculacao_falhou_em")
    .is("numero_automatico", null)
    .not("numero_siafe", "is", null);
  if (error) throw new Error(`Falha ao buscar pendentes: ${error.message}`);

  // Ações desconsideradas (lista "Todas" e lista "Não vinculadas SIAFE") não são vinculadas no SIMO.
  // Aqui a leitura é com o acesso do servidor, que não passa pelos filtros do banco: tira os IDs na mão.
  const fora = new Set(await idsDeListas(admin, ["todas", "nao_vinculadas"]));
  const candidatos = (obras ?? []).filter(
    (o) =>
      !fora.has(o.id_acao) &&
      (o.status ?? "").trim().toLowerCase() !== "cancelado" &&
      (o.orgao ?? "").trim().toUpperCase() !== "AGESPISA" &&
      /^\d{8}$/.test((o.numero_siafe ?? "").trim()) &&
      (tentarTodas || !(o.vinculacao_ultimo_erro && o.vinculacao_numero_tentado === o.numero_siafe))
  );
  if (tentarTodas) candidatos.sort((a, b) => (a.vinculacao_falhou_em ?? "").localeCompare(b.vinculacao_falhou_em ?? ""));
  if (candidatos.length === 0) return { sucesso: 0, falha: 0, restantes: 0, detalhes: [] };

  const cookie = await loginSimo();
  let sucesso = 0;
  let falha = 0;
  let processadas = 0;
  const detalhes: ResultadoVinculacao["detalhes"] = [];

  for (const obra of candidatos) {
    if (Date.now() - inicio > LIMITE_TEMPO_MS) break;
    processadas++;

    const r = await tentarVincular(admin, cookie, obra, executadoPor);
    if (r.sucesso) sucesso++;
    else falha++;
    detalhes.push({ idAcao: obra.id_acao, nomeAcao: obra.nome_acao, resultado: r.resultado });

    if (processadas < candidatos.length) await new Promise((res) => setTimeout(res, PAUSA_MS));
  }

  return { sucesso, falha, restantes: candidatos.length - processadas, detalhes };
}

// Retry individual, disparado do card na tela, depois de alguém
// corrigir algo (no SIMO ou digitando o número certo aqui mesmo).
// Ignora o erro guardado (é justamente o que essa ação serve pra
// sobrescrever). Se `numeroSiafeOverride` vier diferente do que está
// salvo, grava esse número em obras.numero_siafe antes de tentar -
// assim a pessoa não precisa abrir o SIMO só pra corrigir um dígito
// antes de poder tentar de novo pelo app.
export async function executarVinculacaoUnica(
  idAcao: string,
  executadoPor: string,
  numeroSiafeOverride?: string
): Promise<{ resultado: string; sucesso: boolean }> {
  const admin = createAdminClient();
  const { data: obra, error } = await admin
    .from("obras")
    .select("id_acao, nome_acao, numero_siafe, orgao, status")
    .eq("id_acao", idAcao)
    .single();
  if (error || !obra) throw new Error("Ação não encontrada.");

  const numeroFinal = (numeroSiafeOverride ?? obra.numero_siafe ?? "").trim();
  if (!/^\d{8}$/.test(numeroFinal)) {
    throw new Error("Número do Contrato no SIAFE precisa ter 8 dígitos pra tentar vincular.");
  }

  if (numeroFinal !== (obra.numero_siafe ?? "").trim()) {
    const { error: erroUpdate } = await admin.from("obras").update({ numero_siafe: numeroFinal }).eq("id_acao", idAcao);
    if (erroUpdate) throw new Error(`Falha ao salvar o número corrigido: ${erroUpdate.message}`);
  }

  const cookie = await loginSimo();
  return tentarVincular(admin, cookie, { ...obra, numero_siafe: numeroFinal }, executadoPor);
}

// ---------- REVINCULAÇÃO ----------
// Refaz a vinculação de ações que JÁ estão vinculadas (o SIMO atualiza os valores ao vincular de novo). Guarda como a ação
// estava antes (valores do relatório) e como ficou depois (lido na página da ação no SIMO), para mostrar o que mudou.

export type FotoValores = { total: number | null; pago: number | null; medido: number | null; automatico: string | null };
export type ResultadoRevinculacao = {
  idAcao: string;
  nomeAcao: string;
  numero: string | null;
  origemNumero: string | null;
  sucesso: boolean;
  resultado: string;
  antes: FotoValores | null;
  depois: FotoValores | null;
};

function pagoDoExtra(extra: Record<string, string> | null): number | null {
  if (!extra) return null;
  const chave = Object.keys(extra).find((k) => /valor\s*pago/i.test(k));
  return chave ? dinheiroParaNumero(extra[chave]) : null;
}

const numeroOuNull = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function executarRevinculacao(ids: string[], executadoPor: string): Promise<{ resultados: ResultadoRevinculacao[]; restantes: string[] }> {
  const admin = createAdminClient();
  const inicio = Date.now();
  const unicos = Array.from(new Set(ids.map((i) => i.trim()).filter((i) => /^\d{1,12}$/.test(i))));
  const { data: obras, error } = await admin.from("obras").select("id_acao, nome_acao, numero_siafe, numero_automatico, valor_total, valor_original, extra").in("id_acao", unicos);
  if (error) throw new Error(`Falha ao ler as ações: ${error.message}`);
  const mapa = new Map((obras ?? []).map((o) => [o.id_acao as string, o]));

  const cookie = await loginSimo();
  const resultados: ResultadoRevinculacao[] = [];
  let feitas = 0;

  // Toda tentativa entra no histórico (inclusive as que nem chegaram ao SIMO). Se não gravar, avisa na própria linha.
  const guardar = async (r: ResultadoRevinculacao): Promise<ResultadoRevinculacao> => {
    const { error: erroGrava } = await admin.from("revinculacoes").insert({ id_acao: r.idAcao, nome_acao: r.nomeAcao, numero_usado: r.numero, origem_numero: r.origemNumero, sucesso: r.sucesso, resultado: r.resultado, antes: r.antes, depois: r.depois, executado_por: executadoPor });
    if (erroGrava) {
      console.error("revinculacoes:", erroGrava.message);
      return { ...r, resultado: `${r.resultado} (aviso: não consegui gravar no histórico: ${erroGrava.message})` };
    }
    return r;
  };

  for (const id of unicos) {
    if (Date.now() - inicio > LIMITE_TEMPO_MS) break;
    feitas++;
    const obra = mapa.get(id);
    if (!obra) {
      resultados.push(await guardar({ idAcao: id, nomeAcao: "", numero: null, origemNumero: null, sucesso: false, resultado: "Ação não encontrada no painel (sincronize antes).", antes: null, depois: null }));
      continue;
    }
    const siafe = (obra.numero_siafe ?? "").trim();
    const auto = (obra.numero_automatico ?? "").trim();
    // O SIMO vincula pelo número do contrato no SIAFE. Se ele não estiver válido, tenta o Número Automático.
    const [numero, origem] = /^\d{8}$/.test(siafe) ? [siafe, "Número do Contrato no SIAFE"] : /^\d{8}$/.test(auto) ? [auto, "Número Automático"] : [null, null];
    const antes: FotoValores = { total: numeroOuNull(obra.valor_total) ?? numeroOuNull(obra.valor_original), pago: pagoDoExtra(obra.extra as Record<string, string> | null), medido: null, automatico: auto || null };
    if (!numero) {
      resultados.push(await guardar({ idAcao: id, nomeAcao: obra.nome_acao ?? "", numero: null, origemNumero: null, sucesso: false, resultado: "Sem número de 8 dígitos (nem Contrato SIAFE, nem Número Automático) para revincular.", antes, depois: null }));
      continue;
    }

    let resultado: string;
    let sucesso = false;
    let httpCode: number | null = null;
    let bruta = "";
    try {
      const r = await vincularContratoSiafe(cookie, id, numero);
      httpCode = r.httpCode;
      bruta = r.texto;
      let parsed: { status?: string; message?: string } | null = null;
      try {
        parsed = JSON.parse(r.texto);
      } catch {
        // não é JSON
      }
      if (parsed?.status === "success") {
        resultado = "Revinculada";
        sucesso = true;
      } else if (parsed?.status === "error") resultado = parsed.message || "Erro desconhecido";
      else resultado = `Resposta inesperada (HTTP ${httpCode})`;
    } catch (e) {
      resultado = `Erro: ${e instanceof Error ? e.message : "desconhecido"}`;
    }

    // Lê os valores que o SIMO mostra agora na página da ação.
    let depois: FotoValores | null = null;
    if (sucesso) {
      try {
        const { valores } = await buscarBoletins(cookie, id, 20_000);
        // O "Pago" do cabeçalho da página do SIMO não bate com o do relatório (que é o valor certo): o pago vem do relatório, depois.
        depois = { total: valores.total, pago: null, medido: valores.medido, automatico: null };
      } catch {
        depois = null;
      }
    }

    await admin.from("obras_vinculacao_log").insert({ id_acao: id, nome_acao: obra.nome_acao ?? "", numero_siafe: numero, http_code: httpCode, resultado: sucesso ? "Sucesso" : resultado, resposta_bruta: bruta.slice(0, 2000), executado_por: executadoPor });
    await registrarAnalise(admin, executadoPor, "vinculacao", id, sucesso ? "revinculado" : "falha_revinculacao", resultado);

    resultados.push(await guardar({ idAcao: id, nomeAcao: obra.nome_acao ?? "", numero, origemNumero: origem, sucesso, resultado, antes, depois }));
    if (feitas < unicos.length) await new Promise((res) => setTimeout(res, PAUSA_MS));
  }

  return { resultados, restantes: unicos.slice(feitas) };
}

// Depois de revincular, o valor pago certo está no RELATÓRIO do SIMO (o mesmo que o painel baixa todo dia), não no cabeçalho
// da página da ação. Baixa o relatório uma vez (lento), atualiza essas ações no painel e preenche o "depois" da revinculação.
export async function atualizarPeloRelatorio(ids: string[]): Promise<{ atualizadas: number; naoEncontradas: string[] }> {
  const admin = createAdminClient();
  const unicos = Array.from(new Set(ids.map((i) => i.trim()).filter((i) => /^\d{1,12}$/.test(i)))).slice(0, 2000);
  if (unicos.length === 0) return { atualizadas: 0, naoEncontradas: [] };

  const inicio = Date.now();
  const cookie = await loginSimo(20_000);
  await prepararRelatorioSimo(cookie, 60_000);
  const csv = await baixarCsvSimo(cookie, Math.max(20_000, 250_000 - (Date.now() - inicio)));
  const todas = csvParaObras(csv);
  // Proteção: relatório muito menor que o banco = filtrado ou cortado. Não mexe em nada.
  const { count: noBanco } = await admin.from("obras").select("id_acao", { count: "exact", head: true });
  if (todas.length < Math.max(100, (noBanco ?? 0) * 0.8)) throw new Error(`O relatório veio com ${todas.length} ações e o painel tem ${noBanco ?? 0}: parece filtrado. Nada foi alterado.`);

  const querem = new Set(unicos);
  const achadas = todas.filter((o) => querem.has(o.id_acao));
  const agora = new Date().toISOString();
  if (achadas.length) {
    const { error } = await admin.from("obras").upsert(achadas.map((o) => ({ ...o, atualizado_em: agora })), { onConflict: "id_acao" });
    if (error) throw new Error(`Falha ao atualizar as ações: ${error.message}`);
  }

  // Preenche o "depois" da revinculação mais recente de cada ação.
  const { data: revs } = await admin.from("revinculacoes").select("id, id_acao, depois").in("id_acao", unicos).eq("sucesso", true).order("executado_em", { ascending: false });
  const ultima = new Map<string, { id: number; depois: FotoValores | null }>();
  for (const r of revs ?? []) if (!ultima.has(r.id_acao as string)) ultima.set(r.id_acao as string, { id: r.id as number, depois: r.depois as FotoValores | null });
  for (const o of achadas) {
    const u = ultima.get(o.id_acao);
    if (!u) continue;
    const depois: FotoValores = { total: o.valor_total ?? o.valor_original ?? u.depois?.total ?? null, pago: pagoDoExtra(o.extra), medido: u.depois?.medido ?? null, automatico: o.numero_automatico ?? null };
    await admin.from("revinculacoes").update({ depois }).eq("id", u.id);
  }
  const achou = new Set(achadas.map((o) => o.id_acao));
  return { atualizadas: achadas.length, naoEncontradas: unicos.filter((i) => !achou.has(i)) };
}

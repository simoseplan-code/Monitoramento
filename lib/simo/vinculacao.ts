import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo } from "@/lib/simo/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Endpoint que efetivamente cria o vínculo de contrato SIAFE numa ação
// (o que acontece ao clicar "Vincular Contrato" → colar o código →
// Salvar, no SIMO). Diferente do formulário "Geral" usado por
// lib/simo/formulario.ts — aqui o SIMO responde com um JSON simples
// { status: "success" | "error", message }, sempre em HTTP 200.
const SIMO_CONTRACTS_STORE_URL = "http://simo.pi.gov.br/cahier/action/projects/contracts/store";

// Pausa entre cada vinculação — mesmo valor do script original, pra não
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
// grava o resultado na própria obra — sucesso limpa o erro guardado,
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
    // O SIMO sempre responde HTTP 200, mesmo em erro — o resultado real
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
// 0018) — evita reprocessar em massa um erro que só se resolve com
// correção manual no SIMO.
export async function executarVinculacaoLote(executadoPor: string): Promise<ResultadoVinculacao> {
  const admin = createAdminClient();
  const inicio = Date.now();

  const { data: obras, error } = await admin
    .from("obras")
    .select("id_acao, nome_acao, numero_siafe, orgao, status, vinculacao_ultimo_erro, vinculacao_numero_tentado")
    .is("numero_automatico", null)
    .not("numero_siafe", "is", null);
  if (error) throw new Error(`Falha ao buscar pendentes: ${error.message}`);

  const candidatos = (obras ?? []).filter(
    (o) =>
      (o.status ?? "").trim().toLowerCase() !== "cancelado" &&
      (o.orgao ?? "").trim().toUpperCase() !== "AGESPISA" &&
      /^\d{8}$/.test((o.numero_siafe ?? "").trim()) &&
      !(o.vinculacao_ultimo_erro && o.vinculacao_numero_tentado === o.numero_siafe)
  );
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

// Retry individual — disparado do card na tela, depois de alguém
// corrigir algo manualmente no SIMO. Ignora o erro guardado (é
// justamente o que essa ação serve pra sobrescrever) e tenta de novo
// com o Número do Contrato no SIAFE atual.
export async function executarVinculacaoUnica(idAcao: string, executadoPor: string): Promise<{ resultado: string; sucesso: boolean }> {
  const admin = createAdminClient();
  const { data: obra, error } = await admin
    .from("obras")
    .select("id_acao, nome_acao, numero_siafe, orgao, status")
    .eq("id_acao", idAcao)
    .single();
  if (error || !obra) throw new Error("Ação não encontrada.");
  if (!obra.numero_siafe || !/^\d{8}$/.test(obra.numero_siafe.trim())) {
    throw new Error("Número do Contrato no SIAFE precisa ter 8 dígitos pra tentar vincular.");
  }

  const cookie = await loginSimo();
  return tentarVincular(admin, cookie, obra, executadoPor);
}

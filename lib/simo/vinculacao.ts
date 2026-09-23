import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo } from "@/lib/simo/client";

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

export type ResultadoVinculacao = {
  sucesso: number;
  falha: number;
  restantes: number;
  detalhes: { idAcao: string; nomeAcao: string; resultado: string }[];
};

// Vincula toda ação pendente com Número do Contrato no SIAFE válido (8
// dígitos), órgão diferente de AGESPISA (não possui SIAFE) e status
// diferente de "Cancelado" — mesmo critério da function
// vinculacao_lista (0017) e do script original.
export async function executarVinculacaoLote(executadoPor: string): Promise<ResultadoVinculacao> {
  const admin = createAdminClient();
  const inicio = Date.now();

  const { data: obras, error } = await admin
    .from("obras")
    .select("id_acao, nome_acao, numero_siafe, orgao, status")
    .is("numero_automatico", null)
    .not("numero_siafe", "is", null);
  if (error) throw new Error(`Falha ao buscar pendentes: ${error.message}`);

  const candidatos = (obras ?? []).filter(
    (o) =>
      (o.status ?? "").trim().toLowerCase() !== "cancelado" &&
      (o.orgao ?? "").trim().toUpperCase() !== "AGESPISA" &&
      /^\d{8}$/.test((o.numero_siafe ?? "").trim())
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

    let httpCode: number | null = null;
    let textoResp = "";
    let resultado: string;

    try {
      const r = await vincularContratoSiafe(cookie, obra.id_acao, obra.numero_siafe!.trim());
      httpCode = r.httpCode;
      textoResp = r.texto;
      // O SIMO sempre responde HTTP 200, mesmo em erro — o resultado
      // real vem no campo "status" do JSON.
      let parsed: { status?: string; message?: string } | null = null;
      try {
        parsed = JSON.parse(textoResp);
      } catch {
        // resposta não é JSON
      }

      if (parsed?.status === "success") {
        resultado = "Sucesso";
        sucesso++;
      } else if (parsed?.status === "error") {
        resultado = parsed.message || "Erro desconhecido";
        falha++;
      } else {
        resultado = `Resposta inesperada (HTTP ${httpCode})`;
        falha++;
      }
    } catch (e) {
      resultado = `Erro: ${e instanceof Error ? e.message : "desconhecido"}`;
      falha++;
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

    detalhes.push({ idAcao: obra.id_acao, nomeAcao: obra.nome_acao, resultado });

    if (processadas < candidatos.length) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  return { sucesso, falha, restantes: candidatos.length - processadas, detalhes };
}

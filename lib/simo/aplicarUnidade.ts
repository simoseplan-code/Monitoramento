import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo } from "@/lib/simo/client";
import { salvarUnidadeQuantidade, SomenteLeituraError } from "@/lib/simo/formulario";
import { UNIDADES_VALIDAS } from "@/lib/unidadeQuantidade/sugestao";

// Pausa entre gravações — mesmo valor da planilha (SIMO_GRAVACAO_PAUSA_MS),
// pra não sobrecarregar/derrubar a sessão do SIMO num lote grande.
const PAUSA_MS = 600;
// Corta com folga antes do limite de execução da rota (ver maxDuration
// em app/api/admin/aplicar-unidade/route.ts) — quem chamou a rota vê
// quantas ainda restam e pode rodar de novo pra continuar de onde parou
// (mesma solução que a planilha usa pro timeout de 6 min do Apps Script).
const LIMITE_TEMPO_MS = 45_000;

export type ResultadoAplicacao = {
  sucesso: number;
  falha: number;
  restantes: number;
  detalhes: { idAcao: string; nomeAcao: string; unidade: string; quantidade: string; resultado: string }[];
};

export async function executarAplicacaoUnidade(executadoPor: string): Promise<ResultadoAplicacao> {
  const admin = createAdminClient();
  const inicio = Date.now();

  const { data: aprovadas, error } = await admin
    .from("obras_unidade_sugestao")
    .select("id_acao, unidade_atual, quantidade_atual, unidade_sugerida, quantidade_sugerida, unidade_final, quantidade_final, sem_quantidade, obras(nome_acao)")
    .eq("aprovado", true)
    .is("aplicado_em", null);
  if (error) throw new Error(`Falha ao buscar sugestões aprovadas: ${error.message}`);
  if (!aprovadas || aprovadas.length === 0) {
    return { sucesso: 0, falha: 0, restantes: 0, detalhes: [] };
  }

  let cookie = await loginSimo();
  const renovarLogin = async () => {
    cookie = await loginSimo();
    return cookie;
  };

  let sucesso = 0;
  let falha = 0;
  const detalhes: ResultadoAplicacao["detalhes"] = [];
  let processadas = 0;

  for (const linha of aprovadas) {
    if (Date.now() - inicio > LIMITE_TEMPO_MS) break;
    processadas++;

    const nomeAcao = (linha as unknown as { obras: { nome_acao: string } | null }).obras?.nome_acao ?? "";
    // O valor FINAL é o que a equipe aprovou de verdade — pode ter sido
    // editado na tela em cima da sugestão original (unidade_sugerida é
    // só a proposta do motor, nunca o que vai pro SIMO).
    const unidadeNova = linha.unidade_final || linha.unidade_sugerida;
    const quantidadeNova = linha.quantidade_final || (linha.sem_quantidade ? "" : (linha.quantidade_sugerida ?? ""));

    let httpCode: number | null = null;
    let textoResp = "";
    let resultado: string;
    let aplicadoComSucesso = false;

    try {
      const r = await salvarUnidadeQuantidade(cookie, linha.id_acao, unidadeNova, quantidadeNova, UNIDADES_VALIDAS, renovarLogin);
      httpCode = r.httpCode;
      textoResp = r.texto;
      // O endpoint de edição do SIMO não devolve um JSON claro de
      // sucesso/erro — confirmado na prática (planilha original) que
      // mesmo "Objeto incompleto" (outra aba com pendência) ainda salva
      // Unidade/Quantidade, porque o SIMO não é atômico. Só HTTP
      // diferente de 200 ou erro explícito conta como falha de verdade.
      if (httpCode === 200 && !/erro|error/i.test(textoResp)) {
        resultado = "Sucesso";
        aplicadoComSucesso = true;
        sucesso++;
      } else if (httpCode === 200 && /objeto incompleto/i.test(textoResp)) {
        resultado = "Sucesso (verificável)";
        aplicadoComSucesso = true;
        sucesso++;
      } else {
        resultado = `A verificar (HTTP ${httpCode})`;
        falha++;
      }
    } catch (e) {
      resultado = e instanceof SomenteLeituraError
        ? "Somente leitura mesmo após renovar sessão — pode ser status Concluído ou ação travada no SIMO."
        : `Erro: ${e instanceof Error ? e.message : "desconhecido"}`;
      falha++;
    }

    await admin.from("obras_unidade_log").insert({
      id_acao: linha.id_acao,
      nome_acao: nomeAcao,
      unidade_antiga: linha.unidade_atual,
      unidade_nova: unidadeNova,
      quantidade_antiga: linha.quantidade_atual,
      quantidade_nova: quantidadeNova || null,
      http_code: httpCode,
      resultado,
      resposta_bruta: textoResp.slice(0, 2000),
      executado_por: executadoPor,
    });

    if (aplicadoComSucesso) {
      await admin
        .from("obras_unidade_sugestao")
        .update({ aplicado_em: new Date().toISOString(), aplicado_com_sucesso: true })
        .eq("id_acao", linha.id_acao);
    }

    detalhes.push({ idAcao: linha.id_acao, nomeAcao, unidade: unidadeNova, quantidade: quantidadeNova, resultado });

    if (processadas < aprovadas.length) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  return { sucesso, falha, restantes: aprovadas.length - processadas, detalhes };
}

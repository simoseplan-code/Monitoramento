import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

// Foto de tudo que a equipe digita ou decide no painel (análises, comentários, responsáveis, listas desconsideradas,
// configuração de TD, filtros gravados). É gravada ANTES de cada sincronização com o SIMO e pode ser baixada pelo
// administrador. Serve de rede de segurança: se algo apagar análises, a última foto tem tudo.
// Fica na tabela analises_snapshot (SQL 0093); guarda as últimas fotos diferentes entre si.

const TABELAS: { nome: string; colunas: string; ordem: string[]; filtro?: (q: any) => any }[] = [
  { nome: "obras_revisao", colunas: "*", ordem: ["id_acao"] },
  { nome: "obras_termos_revisao", colunas: "*", ordem: ["id_acao"] },
  { nome: "obras_exec_revisao", colunas: "*", ordem: ["id_acao"] },
  // Só as sugestões que alguém aprovou (o resto o sistema recalcula).
  { nome: "obras_unidade_sugestao", colunas: "*", ordem: ["id_acao"], filtro: (q) => q.eq("aprovado", true) },
  { nome: "td_acoes_mae", colunas: "*", ordem: ["id_acao"] },
  { nome: "td_acoes_filha", colunas: "*", ordem: ["id_acao"] },
  { nome: "acoes_desconsideradas", colunas: "*", ordem: ["tela", "id_acao"] },
  { nome: "filtros_salvos", colunas: "*", ordem: ["usuario_id", "tela"] },
  // Sobreposições: só o que a equipe preenche (sem os trechos, que vêm do mapa).
  {
    nome: "sobreposicoes",
    colunas: "chave_local, chave_obras, status, observacao, solucao, responsavel_id, revisado_por, revisado_em, solucionado_por, solucionado_em",
    ordem: ["chave_local"],
  },
];

const FOTOS_GUARDADAS = 30;
const LIMITE_BYTES = 12 * 1024 * 1024;

export type Snapshot = { gerado_em: string; versao: 1; tabelas: Record<string, { linhas: unknown[] } | { erro: string }> };

/** Lê as tabelas de análise do banco (com o acesso do servidor). Tabela que não existe ainda entra como erro, sem derrubar o resto. */
export async function montarSnapshot(admin: SupabaseClient): Promise<Snapshot> {
  const tabelas: Snapshot["tabelas"] = {};
  for (const t of TABELAS) {
    const linhas: unknown[] = [];
    let erro: string | null = null;
    for (let de = 0; ; de += 1000) {
      let q = admin.from(t.nome).select(t.colunas);
      if (t.filtro) q = t.filtro(q);
      for (const col of t.ordem) q = q.order(col);
      const { data, error } = await q.range(de, de + 999);
      if (error) {
        erro = error.message;
        break;
      }
      linhas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tabelas[t.nome] = erro ? { erro } : { linhas };
  }
  return { gerado_em: new Date().toISOString(), versao: 1, tabelas };
}

const resumoLinhas = (s: Snapshot) => Object.values(s.tabelas).reduce((n, t) => n + ("linhas" in t ? t.linhas.length : 0), 0);
const hashDe = (s: Snapshot) => createHash("sha1").update(JSON.stringify(s.tabelas)).digest("hex");

/** Guarda a foto (se for diferente da última) e apaga as mais antigas. Devolve se gravou. */
export async function guardarSnapshot(admin: SupabaseClient, s: Snapshot, motivo: string): Promise<{ gravou: boolean; motivoNaoGravou?: string }> {
  const hash = hashDe(s);
  const { data: ultima } = await admin.from("analises_snapshot").select("hash").order("id", { ascending: false }).limit(1).maybeSingle();
  if (ultima?.hash === hash) return { gravou: false, motivoNaoGravou: "igual à última foto" };

  const comprimido = gzipSync(Buffer.from(JSON.stringify(s), "utf8")).toString("base64");
  if (comprimido.length > LIMITE_BYTES) return { gravou: false, motivoNaoGravou: "foto grande demais" };
  const { error } = await admin.from("analises_snapshot").insert({ motivo, hash, linhas: resumoLinhas(s), dados_gzip_b64: comprimido });
  if (error) throw new Error(`guardar a foto das análises: ${error.message}`);

  // Fica com as últimas fotos; as cópias linha a linha (analises_copias) têm validade de 120 dias.
  const { data: antigas } = await admin.from("analises_snapshot").select("id").order("id", { ascending: false }).range(FOTOS_GUARDADAS, FOTOS_GUARDADAS + 200);
  const ids = (antigas ?? []).map((r) => r.id as number);
  if (ids.length > 0) await admin.from("analises_snapshot").delete().in("id", ids);
  const limite = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
  await admin.from("analises_copias").delete().lt("registrado_em", limite);
  return { gravou: true };
}

/** Lê uma foto guardada (a mais recente por padrão) já descomprimida. */
export async function lerSnapshot(admin: SupabaseClient, id?: number): Promise<Snapshot | null> {
  let q = admin.from("analises_snapshot").select("dados_gzip_b64");
  q = id ? q.eq("id", id) : q.order("id", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return JSON.parse(gunzipSync(Buffer.from(data.dados_gzip_b64 as string, "base64")).toString("utf8")) as Snapshot;
}

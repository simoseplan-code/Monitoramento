import { createElement } from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { renderToBuffer } from "@react-pdf/renderer";
import { PendenciasPdf, type OrgaoPendente } from "@/lib/pdf/PendenciasPdf";

// Pages Router de propósito (mesmo motivo de pdf.ts): o gerador de PDF usa o React
// instalado, e o App Router do Next usa um React próprio.
export const config = { maxDuration: 60, api: { responseLimit: false } };

// Texto de cada item marcado como pendente, como o órgão vai ler.
const TEXTO_ITEM = {
  kml: "KML não anexado ou com problema",
  duplicacao: "Possível duplicação com outra ação",
  documentos: "Documentos obrigatórios não inseridos",
} as const;

type Linha = {
  id_acao: string;
  nome_acao: string;
  orgao: string;
  data_criacao: string | null;
  kml_anexado: string;
  sem_duplicacao: string;
  documentos_obrigatorios: string;
  encaminhada_em: string;
  responsavel_nome: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        res.setHeader(
          "Set-Cookie",
          cookiesToSet.map(({ name, value, options }) => serializeCookieHeader(name, value, options))
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: "Não autenticado." });

  const { data: perfil } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return res.status(403).json({ error: "Sem permissão." });

  const orgaoPedido = (Array.isArray(req.query.orgao) ? req.query.orgao[0] : req.query.orgao)?.trim();

  try {
    const { data, error } = await supabase.rpc("novas_acoes_encaminhadas");
    if (error) throw new Error(error.message);

    const porOrgao = new Map<string, OrgaoPendente>();
    for (const l of (data ?? []) as Linha[]) {
      if (orgaoPedido && l.orgao !== orgaoPedido) continue;
      // Só o que foi marcado como pendente (aguardando atualização).
      const itens: string[] = [];
      if (l.kml_anexado === "aguardando_atualizacao") itens.push(TEXTO_ITEM.kml);
      if (l.sem_duplicacao === "aguardando_atualizacao") itens.push(TEXTO_ITEM.duplicacao);
      if (l.documentos_obrigatorios === "aguardando_atualizacao") itens.push(TEXTO_ITEM.documentos);
      if (itens.length === 0) continue;

      const g = porOrgao.get(l.orgao) ?? { orgao: l.orgao, acoes: [] };
      porOrgao.set(l.orgao, g);
      g.acoes.push({
        idAcao: l.id_acao,
        nomeAcao: l.nome_acao,
        dataCriacao: l.data_criacao,
        responsavel: l.responsavel_nome,
        encaminhadaEm: l.encaminhada_em,
        itens,
      });
    }

    const orgaos = Array.from(porOrgao.values()).sort((a, b) => a.orgao.localeCompare(b.orgao, "pt-BR"));
    if (orgaos.length === 0) return res.status(404).json({ error: "Não há ações aguardando solução de pendência." });

    const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
    const buffer = await renderToBuffer(createElement(PendenciasPdf, { orgaos, geradoEm }) as Parameters<typeof renderToBuffer>[0]);

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const nomeOrgao = orgaoPedido ? `-${orgaoPedido.replace(/[^A-Za-z0-9]+/g, "_")}` : "-todos-os-orgaos";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="pendencias${nomeOrgao}-${hoje}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("relatorio pendencias:", e);
    return res.status(500).json({ error: "Falha ao gerar o PDF." });
  }
}

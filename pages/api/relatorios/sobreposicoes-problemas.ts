import { createElement } from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { renderToBuffer } from "@react-pdf/renderer";
import { SobreposicoesProblemasPdf } from "@/lib/pdf/SobreposicoesProblemasPdf";
import { buscarParesComProblema } from "@/lib/sobreposicoes/relatorioProblemas";

// Pages Router de propósito (mesmo motivo de pdf.ts e pendencias.ts): o gerador de PDF usa o React instalado.
export const config = { maxDuration: 60, api: { responseLimit: false } };

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
  // Sobreposições é só para admin e chefe.
  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
  if (perfil?.status !== "aprovado" || !perfil.is_admin) return res.status(403).json({ error: "Sem permissão." });

  try {
    const orgaoParam = Array.isArray(req.query.orgao) ? req.query.orgao[0] : req.query.orgao;
    const orgaos = (orgaoParam ?? "").split("|").map((o) => o.trim()).filter(Boolean);
    const destino = (Array.isArray(req.query.destino) ? req.query.destino[0] : req.query.destino) === "cgfr" ? "cgfr" : "pendencias";
    const pares = (await buscarParesComProblema(supabase, orgaos, destino, (Array.isArray(req.query.semvic) ? req.query.semvic[0] : req.query.semvic) === "1", (Array.isArray(req.query.semcanc) ? req.query.semcanc[0] : req.query.semcanc) === "1")).sort((a, b) => (b.extensaoM ?? 0) - (a.extensaoM ?? 0));
    const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
    const buffer = await renderToBuffer(createElement(SobreposicoesProblemasPdf, { pares, geradoEm, orgaosFiltro: orgaos, destino }) as Parameters<typeof renderToBuffer>[0]);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sobreposicoes-${destino === "cgfr" ? "cgfr" : "com-problema"}${orgaos.length === 1 ? `-${orgaos[0].replace(/[^A-Za-z0-9]+/g, "_")}` : ""}-${hoje}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("relatorio sobreposicoes problemas (pdf):", e);
    return res.status(500).json({ error: "Falha ao gerar o PDF." });
  }
}

import { createElement } from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { renderToBuffer } from "@react-pdf/renderer";
import { reunirDadosPdf } from "@/lib/relatorioDados";
import { RelatorioPdf, type TipoPdf } from "@/lib/pdf/RelatorioPdf";

// Fica no Pages Router de propósito: o gerador de PDF usa o React instalado
// (18), e o App Router do Next usa um React próprio, misturar os dois dá
// "Minified React error #31". Aqui os dois são o mesmo React.
export const config = { maxDuration: 60, api: { responseLimit: false } };

const TIPOS: TipoPdf[] = ["completo", "novas_acoes", "sobreposicoes", "termos"];

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

  const { data: perfil } = await supabase.from("profiles").select("status, is_admin").eq("id", user.id).single();
  // Relatórios só para administrador.
  if (perfil?.status !== "aprovado" || !perfil.is_admin) return res.status(403).json({ error: "Sem permissão." });

  const tipo = (Array.isArray(req.query.tipo) ? req.query.tipo[0] : req.query.tipo) as TipoPdf | undefined;
  if (!tipo || !TIPOS.includes(tipo)) return res.status(400).json({ error: "Tipo de relatório inválido." });

  try {
    // A página de desempenho da equipe só entra para admin.
    const dados = await reunirDadosPdf(supabase, !!perfil.is_admin);
    const buffer = await renderToBuffer(createElement(RelatorioPdf, { dados, tipo }) as Parameters<typeof renderToBuffer>[0]);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${tipo.replace("_", "-")}-${hoje}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("relatorio pdf:", e);
    return res.status(500).json({ error: "Falha ao gerar o relatório." });
  }
}

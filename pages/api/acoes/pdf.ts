import { createElement } from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { renderToBuffer } from "@react-pdf/renderer";
import { carregarAcoes, montarListagem } from "@/lib/acoesDados";
import { AcoesPdf } from "@/lib/pdf/AcoesPdf";

// Pages Router de propósito (mesmo motivo dos outros PDFs): o gerador usa o React instalado, e o
// App Router do Next usa um React próprio ("Minified React error #31").
export const config = { maxDuration: 60, api: { responseLimit: false, bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

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
  const { data: perfil } = await supabase.from("profiles").select("nome, status").eq("id", user.id).single();
  if (perfil?.status !== "aprovado") return res.status(403).json({ error: "Sem permissão." });

  try {
    const { acoes, erro } = await carregarAcoes(supabase);
    if (erro) return res.status(500).json({ error: "Não consegui ler as ações." });
    const listagem = montarListagem(acoes, (req.body as { estado?: unknown } | undefined)?.estado);
    const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
    const buffer = await renderToBuffer(
      createElement(AcoesPdf, { r: listagem, geradoEm, geradoPor: perfil.nome ?? "Usuário" }) as Parameters<typeof renderToBuffer>[0]
    );
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="acoes-${hoje}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    console.error("pdf acoes:", e);
    return res.status(500).json({ error: "Falha ao gerar o PDF." });
  }
}

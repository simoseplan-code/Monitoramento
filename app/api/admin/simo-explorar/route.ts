import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSimo } from "@/lib/simo/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SIMO = "http://simo.pi.gov.br";
const PALAVRAS = /kml|kmz|anex|attach|download|arquivo|file|document|upload|geo/i;

function textoSimples(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function links(html: string) {
  const achados: { href: string; texto: string }[] = [];
  const vistos = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (vistos.has(href) || href.startsWith("javascript") || href === "#") continue;
    vistos.add(href);
    achados.push({ href, texto: textoSimples(m[2]).slice(0, 80) });
  }
  return achados;
}

// Ferramenta de diagnóstico (só administrador, só leitura): entra no SIMO com o login do
// painel e mostra o que a página de uma ação (ou outro caminho do SIMO) contém, para
// descobrir onde fica o KML anexado e como baixar.
//   /api/admin/simo-explorar?id=18257              -> página da ação
//   /api/admin/simo-explorar?caminho=/cahier/...   -> qualquer outro caminho do SIMO
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id") ?? "";
  let caminho = request.nextUrl.searchParams.get("caminho") ?? "";
  const idValido = /^\d{1,12}$/.test(id);

  // ?id=...&tentar=arquivos: testa de uma vez os endereços prováveis da lista de arquivos da
  // ação e mostra um resumo curto de cada um (o que responde sem erro é o caminho certo).
  if (idValido && request.nextUrl.searchParams.get("tentar") === "arquivos") {
    const candidatos = [
      `/cahier/files/list/source/action_project/source_id/${id}/`,
      `/cahier/files/list/source/action_project/source_id/${id}`,
      `/cahier/files/index/source/action_project/source_id/${id}/`,
      `/cahier/files/list-preview/source/action_project/source_id/${id}/`,
      `/cahier/files/source/action_project/source_id/${id}/`,
      `/cahier/files/?source=action_project&source_id=${id}`,
      `/cahier/files/list/?source=action_project&source_id=${id}`,
      `/cahier/files/list/source/action_projects/source_id/${id}/`,
      `/cahier/files/list/source/project/source_id/${id}/`,
    ];
    try {
      let cookie = await loginSimo();
      const abertura = await fetch(`${SIMO}/cahier/action/projects/show/id/${id}`, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const novos = abertura.headers.getSetCookie?.() ?? [];
      if (novos.length) cookie = [cookie, ...novos.map((c) => c.split(";")[0])].join("; ");
      await abertura.arrayBuffer();
      const resultados = [];
      for (const c of candidatos) {
        const r = await fetch(SIMO + c, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
        const buf = Buffer.from(await r.arrayBuffer());
        const txt = buf.toString("utf8");
        resultados.push({
          caminho: c,
          status: r.status,
          tipo: r.headers.get("content-type"),
          tamanho: buf.length,
          inicio: textoSimples(txt).slice(0, 500),
          linksDeArquivo: links(txt).filter((l) => PALAVRAS.test(l.href) || PALAVRAS.test(l.texto)).slice(0, 30),
        });
      }
      return NextResponse.json({ id, resultados });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o SIMO." }, { status: 502 });
    }
  }

  if (idValido && !caminho) caminho = `/cahier/action/projects/show/id/${id}`;
  // Só caminhos do próprio SIMO (host fixo), nunca um endereço vindo de fora.
  if (!caminho.startsWith("/cahier/") || caminho.includes("..") || caminho.includes("://") || caminho.length > 400) {
    return NextResponse.json({ error: "Use ?id=NÚMERO_DA_AÇÃO ou ?caminho=/cahier/..." }, { status: 400 });
  }

  try {
    let cookie = await loginSimo();
    // As abas da ação (Arquivos, Estágios...) usam endereços sem o ID: o SIMO guarda a ação
    // aberta na sessão. Com ?id=...&caminho=..., abre a ação primeiro e depois o caminho.
    if (idValido && !caminho.includes(`/show/id/${id}`)) {
      const abertura = await fetch(`${SIMO}/cahier/action/projects/show/id/${id}`, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const novos = abertura.headers.getSetCookie?.() ?? [];
      if (novos.length) cookie = [cookie, ...novos.map((c) => c.split(";")[0])].join("; ");
      await abertura.arrayBuffer();
    }
    const resp = await fetch(SIMO + caminho, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(40_000) });
    const tipo = resp.headers.get("content-type") ?? "";
    const base = {
      caminho,
      status: resp.status,
      tipo,
      redirecionaPara: resp.headers.get("location"),
      disposicao: resp.headers.get("content-disposition"),
    };

    const buffer = Buffer.from(await resp.arrayBuffer());
    const cabecalho = buffer.subarray(0, 4);
    const ehZip = cabecalho[0] === 0x50 && cabecalho[1] === 0x4b;
    const textoInicio = buffer.subarray(0, 400).toString("utf8");

    if (/html|text\/plain/i.test(tipo) || /^\s*<(!doctype|html)/i.test(textoInicio)) {
      const html = buffer.toString("utf8");
      // ?bruto=PALAVRA devolve o HTML cru em volta da primeira ocorrência (para ver como a
      // linha de uma pasta/arquivo é montada: links, onclick, ids).
      const bruto = request.nextUrl.searchParams.get("bruto");
      if (bruto) {
        const pos = html.toLowerCase().indexOf(bruto.toLowerCase());
        const ini = Math.max(0, pos - 600);
        return NextResponse.json({ ...base, tamanho: buffer.length, achou: pos >= 0, htmlCru: pos >= 0 ? html.slice(ini, ini + 3500) : null });
      }
      const todos = links(html);
      const relevantes = todos.filter((l) => PALAVRAS.test(l.href) || PALAVRAS.test(l.texto) || (id && l.href.includes(id)));
      const texto = textoSimples(html);
      // Trechos de texto em volta de "KML" / "anexo" para ver o rótulo na tela.
      const trechos: string[] = [];
      for (const m of texto.matchAll(/.{0,80}(kml|kmz|anexo|arquivo)[^ ]*.{0,120}/gi)) {
        trechos.push(m[0]);
        if (trechos.length >= 15) break;
      }
      return NextResponse.json({
        ...base,
        tamanho: buffer.length,
        titulo: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
        linksRelevantes: relevantes.slice(0, 80),
        totalDeLinks: todos.length,
        todosOsLinks: todos.length <= 150 ? todos : todos.slice(0, 150),
        trechosComKml: trechos,
        tabsOuAbas: [...html.matchAll(/(?:data-tab|aria-controls|href)=["']#?([a-z0-9_-]*(?:tab|aba|doc|anex|attach)[a-z0-9_-]*)["']/gi)].map((m) => m[1]).slice(0, 30),
        inicioDoTexto: texto.slice(0, 1500),
      });
    }

    return NextResponse.json({
      ...base,
      tamanho: buffer.length,
      pareceKml: /<kml[\s>]/i.test(buffer.subarray(0, 4000).toString("utf8")),
      pareceKmz: ehZip,
      inicioDoConteudo: ehZip ? "(arquivo compactado)" : textoInicio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o SIMO." }, { status: 502 });
  }
}

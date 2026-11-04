import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acessoDoUsuario, idsHidricos } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { amostrarLinha, carregarTracadosBrutos, type Coord } from "@/lib/tracadosAcoes";
import { corDoStatus } from "@/lib/territorios";

export const runtime = "nodejs";
export const maxDuration = 30;

// Quantas ações o arquivo aceita de uma vez. Igual ao do mapa da tela.
const LIMITE_ACOES = 1500;
// O arquivo precisa caber na resposta da hospedagem (uns 4 MB): teto de pontos no total e por ação.
const PONTOS_TOTAL = 100_000;
const PONTOS_POR_ACAO = 400;

type Item = { id: string; nome: string; orgao: string; status: string; tipologia: string; territorio: string; territorios: string; vinculacao: string; execucao: string };

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

// KML aaBBGGRR a partir de #RRGGBB.
const corKml = (hex: string, alfa = "ff") => `${alfa}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`;
const coords = (pts: Coord[]) => pts.map((p) => `${p[0]},${p[1]},0`).join(" ");

// Gera o KML das ações do filtro: uma pasta por território e, dentro, uma subpasta por tipologia (ou por status).
// Aberto a toda a equipe aprovada, como o mapa de traçados.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const acesso = await acessoDoUsuario(supabase, user.id);
    if (!acesso.liberado) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const corpo = (await request.json().catch(() => null)) as { itens?: unknown; subpastas?: unknown } | null;
    const itens: Item[] = [];
    if (Array.isArray(corpo?.itens)) {
      for (const x of corpo.itens as Record<string, unknown>[]) {
        const id = texto(x?.id, 12);
        if (!/^\d{1,12}$/.test(id)) continue;
        itens.push({ id, nome: texto(x.nome), orgao: texto(x.orgao), status: texto(x.status), tipologia: texto(x.tipologia), territorio: texto(x.territorio), territorios: texto(x.territorios, 400), vinculacao: texto(x.vinculacao), execucao: texto(x.execucao, 20) });
      }
    }
    if (acesso.digepi) {
      const ok = new Set(await idsHidricos(createAdminClient(), itens.map((i) => i.id)));
      for (let k = itens.length - 1; k >= 0; k--) if (!ok.has(itens[k].id)) itens.splice(k, 1);
    }
    if (itens.length === 0) return NextResponse.json({ error: "Nenhuma ação pedida." }, { status: 400 });
    if (itens.length > LIMITE_ACOES) return NextResponse.json({ error: `São ${itens.length} ações: filtre até ${LIMITE_ACOES} para gerar o KML.` }, { status: 413 });
    const porStatus = corpo?.subpastas === "status";

    const tracados = await carregarTracadosBrutos(createAdminClient(), itens.map((i) => i.id));
    const porAcao = Math.max(20, Math.min(PONTOS_POR_ACAO, Math.floor(PONTOS_TOTAL / Math.max(1, tracados.size))));

    // território -> subpasta -> ações
    const arvore = new Map<string, Map<string, string[]>>();
    const estilos = new Set<string>();
    let semTracado = 0;
    for (const it of itens) {
      const t = tracados.get(it.id);
      if (!t) {
        semTracado++;
        continue;
      }
      const cor = corDoStatus(it.status);
      estilos.add(cor);
      const totalPts = t.linhas.reduce((s, l) => s + l.length, 0) || 1;
      const geoms: string[] = [];
      for (const l of t.linhas.slice(0, 60)) {
        const reduzida = amostrarLinha(l, Math.max(2, Math.round((l.length / totalPts) * porAcao)));
        if (reduzida.length >= 2) geoms.push(`<LineString><tessellate>1</tessellate><coordinates>${coords(reduzida)}</coordinates></LineString>`);
      }
      for (const p of t.poligonos) {
        const anel = amostrarLinha(p, 60);
        if (anel.length < 3) continue;
        const fechado = anel[0][0] === anel[anel.length - 1][0] && anel[0][1] === anel[anel.length - 1][1] ? anel : [...anel, anel[0]];
        geoms.push(`<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coords(fechado)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`);
      }
      for (const p of t.pontos) geoms.push(`<Point><coordinates>${p[0]},${p[1]},0</coordinates></Point>`);
      if (geoms.length === 0) {
        semTracado++;
        continue;
      }
      const linhasDesc = [
        ["ID da ação", it.id],
        ["Órgão", it.orgao],
        ["Status", it.status],
        ["Tipologia", it.tipologia],
        ["Território(s)", it.territorios],
        ["Vinculação SIAFE", it.vinculacao],
        ["Execução", it.execucao],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `<b>${xml(k)}:</b> ${xml(v)}`)
        .join("<br/>");
      const marca =
        `<Placemark><name>${xml(it.id)} - ${xml(it.nome)}</name><description><![CDATA[${linhasDesc.replace(/]]>/g, "")}]]></description>` +
        `<styleUrl>#c${cor.slice(1)}</styleUrl>${geoms.length > 1 ? `<MultiGeometry>${geoms.join("")}</MultiGeometry>` : geoms[0]}</Placemark>`;

      const pasta1 = it.territorio || "Sem localização";
      const pasta2 = (porStatus ? it.status : it.tipologia) || (porStatus ? "Sem status" : "Sem tipologia");
      const sub = arvore.get(pasta1) ?? new Map<string, string[]>();
      const lista = sub.get(pasta2) ?? [];
      lista.push(marca);
      sub.set(pasta2, lista);
      arvore.set(pasta1, sub);
    }

    const estilosXml = Array.from(estilos)
      .map(
        (cor) =>
          `<Style id="c${cor.slice(1)}"><LineStyle><color>${corKml(cor)}</color><width>3</width></LineStyle><PolyStyle><color>${corKml(cor, "55")}</color></PolyStyle>` +
          `<IconStyle><color>${corKml(cor)}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`
      )
      .join("");
    const pastas = Array.from(arvore)
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([terr, sub]) => {
        const total = Array.from(sub.values()).reduce((s, l) => s + l.length, 0);
        const subs = Array.from(sub)
          .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"))
          .map(([nome, marcas]) => `<Folder><name>${xml(nome)} (${marcas.length})</name>${marcas.join("")}</Folder>`)
          .join("");
        return `<Folder><name>${xml(terr)} (${total})</name>${subs}</Folder>`;
      })
      .join("");

    const hoje = new Date().toLocaleDateString("pt-BR");
    const kml =
      `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Mapa geral das ações (${xml(hoje)})</name>` +
      `<description>${tracados.size} ação(ões) com traçado${semTracado ? `; ${semTracado} sem traçado guardado ficaram de fora` : ""}. Pastas: território e ${porStatus ? "status" : "tipologia"}. Cor pelo status da ação. Linhas simplificadas.</description>` +
      `${estilosXml}${pastas}</Document></kml>`;

    return new NextResponse(kml, {
      headers: {
        "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="mapa-geral-${new Date().toISOString().slice(0, 10)}.kml"`,
        "X-Sem-Tracado": String(semTracado),
        "X-Com-Tracado": String(tracados.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("territorios kml:", msg);
    return NextResponse.json({ error: `Não foi possível gerar o KML: ${msg}` }, { status: 500 });
  }
}

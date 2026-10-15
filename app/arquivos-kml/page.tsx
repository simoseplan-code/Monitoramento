import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/layout/AppShell";
import { Paginacao } from "@/components/Paginacao";
import { IdAcaoLink } from "@/components/IdAcaoLink";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { comprimentoM } from "@/lib/kml/analisar";
import { wktParaLinhasLonLat } from "@/lib/kml/base";
import { LoteKml } from "./LoteKml";

const PAGE_SIZE = 50;

type Linha = {
  id_acao: string;
  situacao: "baixado" | "sem_kml" | "erro";
  nome_arquivo: string | null;
  tamanho_bytes: number | null;
  extensao_km: number | null;
  qtd_pontos: number | null;
  qtd_linhas: number | null;
  qtd_poligonos: number | null;
  mensagem: string | null;
  verificado_em: string;
  baixado_em: string | null;
};

const ABAS = [
  { valor: "com", situacao: "baixado", rotulo: "Com KML guardado", ativa: "bg-status-good text-white" },
  { valor: "importados", situacao: null, rotulo: "Com KML importado", ativa: "bg-series-1 text-white" },
  { valor: "sem", situacao: "sem_kml", rotulo: "Sem KML no SIMO", ativa: "bg-status-warning text-white" },
  { valor: "erro", situacao: "erro", rotulo: "Com erro", ativa: "bg-status-critical text-white" },
] as const;

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-");
const kb = (b: number | null) => (b == null ? "-" : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function ArquivosKmlPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; busca?: string; pagina?: string }>;
}) {
  const { aba, busca, pagina } = await searchParams;
  const abaAtual = ABAS.find((a) => a.valor === aba) ?? ABAS[0];
  const paginaAtual = Math.max(1, parseInt(pagina ?? "1", 10) || 1);
  const termo = (busca ?? "").replace(/\D/g, "").slice(0, 12);
  const de = (paginaAtual - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Os traçados importados (atualização do mapa) ficam numa tabela restrita; aqui só se leem
  // ID, extensão e data para mostrar quais ações já têm o desenho.
  const admin = createAdminClient();

  const [{ data: profile }, { count: totalAcoes }, { count: pendentesAprovacao }, novasAcoesPendentes, { data: resumoRpc }, { data: todosKml }, { data: idsImportados }] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    supabase.rpc("kml_arquivos_resumo"),
    supabase.from("kml_arquivos").select("id_acao, situacao"),
    admin.from("obras_tracado").select("id_acao"),
  ]);

  const resumo = resumoRpc?.[0] ?? { baixados: 0, sem_kml: 0, com_erro: 0, total_acoes: 0 };
  const baixados = Number(resumo.baixados);
  const semKml = Number(resumo.sem_kml);
  const comErro = Number(resumo.com_erro);
  const importadosIds = (idsImportados ?? []).map((r) => r.id_acao as string);
  const idsKml = new Set((todosKml ?? []).map((r) => r.id_acao as string));
  const baixadosSet = new Set((todosKml ?? []).filter((r) => r.situacao === "baixado").map((r) => r.id_acao as string));
  const verificadas = new Set([...idsKml, ...importadosIds]);
  const naoVerificadas = Math.max(0, Number(resumo.total_acoes) - verificadas.size);
  const ehAdmin = !!profile?.is_admin;

  // ---- lista da aba escolhida ----
  let linhas: Linha[] = [];
  let importadosPagina: { id_acao: string; km: number | null; atualizado_em: string | null }[] = [];
  let totalLista = 0;
  let erroLista: string | null = null;

  if (abaAtual.valor === "importados") {
    let q = admin.from("obras_tracado").select("id_acao, wkt, atualizado_em", { count: "exact" });
    if (termo) q = q.like("id_acao", `${termo}%`);
    const { data: rows, count, error } = await q.order("id_acao").range(de, de + PAGE_SIZE - 1);
    if (error) erroLista = error.message;
    totalLista = count ?? 0;
    importadosPagina = (rows ?? []).map((r) => ({
      id_acao: r.id_acao as string,
      km: Math.round((wktParaLinhasLonLat(r.wkt as string).reduce((s, l) => s + comprimentoM(l), 0) / 1000) * 100) / 100,
      atualizado_em: r.atualizado_em as string | null,
    }));
  } else {
    let q = supabase
      .from("kml_arquivos")
      .select("id_acao, situacao, nome_arquivo, tamanho_bytes, extensao_km, qtd_pontos, qtd_linhas, qtd_poligonos, mensagem, verificado_em, baixado_em", { count: "exact" })
      .eq("situacao", abaAtual.situacao);
    if (termo) q = q.like("id_acao", `${termo}%`);
    const { data: rows, count, error } = await q.order("verificado_em", { ascending: false }).range(de, de + PAGE_SIZE - 1);
    if (error) erroLista = error.message;
    totalLista = count ?? 0;
    linhas = (rows ?? []) as Linha[];
  }

  // Nome e órgão de cada ação da página (da base sincronizada).
  const idsPagina = abaAtual.valor === "importados" ? importadosPagina.map((l) => l.id_acao) : linhas.map((l) => l.id_acao);
  const { data: obras } = idsPagina.length ? await supabase.from("obras").select("id_acao, nome_acao, orgao").in("id_acao", idsPagina) : { data: [] as { id_acao: string; nome_acao: string; orgao: string | null }[] };
  const porId = new Map((obras ?? []).map((o) => [o.id_acao, o]));

  const totalPaginas = Math.max(1, Math.ceil(totalLista / PAGE_SIZE));
  const hrefAba = (valor: string) => `/arquivos-kml${valor === "com" ? "" : `?aba=${valor}`}`;

  const celulaAcao = (id: string) => {
    const o = porId.get(id);
    return (
      <>
        <td className="px-3 py-2 font-medium">
          <IdAcaoLink id={id} />
        </td>
        <td className="max-w-md px-3 py-2 text-ink-secondary">
          <span className="block truncate" title={o?.nome_acao}>{o?.nome_acao ?? "(ação não está mais na base)"}</span>
          {o?.orgao && <span className="text-ink-muted">{o.orgao}</span>}
        </td>
      </>
    );
  };

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={ehAdmin}
      counts={{ acoes: totalAcoes ?? 0, pendentesAprovacao: pendentesAprovacao ?? 0, novasAcoesPendentes }}
      titulo="Arquivos KML"
      subtitulo={`${baixados.toLocaleString("pt-BR")} guardado(s) · ${importadosIds.length.toLocaleString("pt-BR")} importado(s) do mapa · ${semKml.toLocaleString("pt-BR")} sem KML no SIMO`}
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-2 text-sm font-semibold text-ink-primary">Como funciona</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-xs text-ink-secondary">
            <li>
              Existem duas origens de KML. <strong>KML guardado</strong>: o arquivo baixado do SIMO quando alguém clica em <strong>Analisar KML</strong> num card (ou pela busca em lote
              abaixo). Na primeira vez o painel baixa, guarda e analisa; nas próximas abre direto a análise, sem ir ao SIMO.
            </li>
            <li>
              <strong>KML importado</strong>: o traçado que já veio da atualização do mapa (a mesma base das Sobreposições). O painel já tem o desenho dessas ações, então não precisa baixar o KML delas só para comparar. O botão Analisar KML só fica verde quando o arquivo KML da ação for baixado (por exemplo, para ver município e bairros).
            </li>
            <li>
              O botão <strong className="text-status-good">verde</strong> significa que o arquivo KML da ação já está guardado. O botão <strong>branco</strong> significa que ainda não foi baixado.
            </li>
            <li>
              Na comparação de sobreposição entre ações, o traçado que vem da <strong>atualização do mapa</strong> (importado) sempre vale. O KML guardado só entra no lugar quando a atualização ainda não tem aquele ID. Se um dia a atualização passar a ter, ela assume.
            </li>
            <li>
              <strong>Sem KML no SIMO</strong> são as ações em que o painel tentou baixar e o SIMO não tinha arquivo anexado (aba Trechos). Se o órgão anexar depois, é só analisar de novo que ela passa para "Com KML guardado".
            </li>
            <li>
              Se o KML foi trocado no SIMO, abra a análise e use <strong>Baixar de novo do SIMO</strong>, ou marque a opção de baixar de novo no campo abaixo.
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile cor="text-status-good" valor={baixados} rotulo="Com KML guardado" dica="Arquivo baixado do SIMO (botão verde)" />
          <Tile cor="text-series-1" valor={importadosIds.length} rotulo="Com KML importado" dica="Traçado vindo da atualização do mapa" />
          <Tile cor="text-status-warning" valor={semKml} rotulo="Sem KML no SIMO" dica="Já tentei e não tem anexado" />
          <Tile cor="text-status-critical" valor={comErro} rotulo="Com erro" dica="O SIMO falhou ou o arquivo não abriu" />
          <Tile cor="text-ink-secondary" valor={naoVerificadas} rotulo="Ainda não verificadas" dica="Sem traçado importado e ninguém tentou baixar" />
        </div>

        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold text-ink-primary">Buscar KMLs em lote</h2>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-ink-secondary">
            <li>Cole abaixo os IDs das ações que você sabe que têm KML no SIMO (um por linha ou separados por vírgula).</li>
            <li>Clique em <strong>Buscar KMLs no SIMO</strong>. O painel baixa e guarda um por um, mostrando o andamento. Deixe a tela aberta até terminar.</li>
            <li>No fim, os baixados aparecem na lista abaixo e os botões nos cards ficam verdes. Os que o SIMO não tem vão para "Sem KML no SIMO".</li>
          </ol>
          <p className="mb-3 text-xs text-ink-muted">
            Leva em torno de 1 a 3 segundos por ação. Se parar ou fechar a tela no meio, o que já foi baixado continua guardado e é só colar os IDs de novo (os que já estão guardados são pulados).
          </p>
          {ehAdmin ? (
            <LoteKml />
          ) : (
            <p className="rounded-lg bg-plane px-3 py-2 text-xs text-ink-secondary">A busca em lote é só para administrador e chefe, porque acessa o SIMO. Para uma ação isolada, use o botão Analisar KML no card.</p>
          )}
        </section>

        <section className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {ABAS.map((a) => (
              <Link
                key={a.valor}
                href={hrefAba(a.valor)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${abaAtual.valor === a.valor ? a.ativa : "border border-black/10 text-ink-secondary hover:bg-plane"}`}
              >
                {a.rotulo}
              </Link>
            ))}
            <form action="/arquivos-kml" className="ml-auto flex items-center gap-2">
              {abaAtual.valor !== "com" && <input type="hidden" name="aba" value={abaAtual.valor} />}
              <input
                name="busca"
                defaultValue={termo}
                inputMode="numeric"
                placeholder="Buscar pelo ID..."
                className="w-40 rounded-lg border border-black/10 bg-plane px-3 py-1.5 text-xs text-ink-secondary focus:border-series-1 focus:outline-none"
              />
            </form>
          </div>

          {erroLista && <p className="mb-3 rounded-lg bg-status-critical/10 px-3 py-2 text-xs text-status-critical">Falha ao carregar a lista: {erroLista}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-black/5 text-left uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Ação</th>
                  {abaAtual.valor === "com" && (
                    <>
                      <th className="px-3 py-2">Arquivo</th>
                      <th className="px-3 py-2 text-right">Pontos</th>
                      <th className="px-3 py-2 text-right">Trechos</th>
                      <th className="px-3 py-2 text-right">Extensão</th>
                      <th className="px-3 py-2 text-right">Baixado em</th>
                    </>
                  )}
                  {abaAtual.valor === "importados" && (
                    <>
                      <th className="px-3 py-2 text-right">Extensão do traçado</th>
                      <th className="px-3 py-2">Arquivo KML</th>
                      <th className="px-3 py-2 text-right">Atualizado em</th>
                    </>
                  )}
                  {(abaAtual.valor === "sem" || abaAtual.valor === "erro") && (
                    <>
                      <th className="px-3 py-2">Motivo</th>
                      <th className="px-3 py-2 text-right">Última tentativa</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {abaAtual.valor === "importados"
                  ? importadosPagina.map((l) => (
                      <tr key={l.id_acao} className="border-b border-black/5 last:border-0">
                        {celulaAcao(l.id_acao)}
                        <td className="tabular px-3 py-2 text-right">{l.km != null ? `${l.km.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : "-"}</td>
                        <td className="px-3 py-2">
                          {baixadosSet.has(l.id_acao) ? <span className="font-medium text-status-good">Arquivo guardado</span> : <span className="text-ink-muted">Traçado do mapa</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-secondary">{data(l.atualizado_em)}</td>
                      </tr>
                    ))
                  : linhas.map((l) => (
                      <tr key={l.id_acao} className="border-b border-black/5 last:border-0">
                        {celulaAcao(l.id_acao)}
                        {abaAtual.valor === "com" ? (
                          <>
                            <td className="px-3 py-2 text-ink-secondary">
                              {l.nome_arquivo ?? "-"} <span className="text-ink-muted">({kb(l.tamanho_bytes)})</span>
                            </td>
                            <td className="tabular px-3 py-2 text-right">{l.qtd_pontos ?? "-"}</td>
                            <td className="tabular px-3 py-2 text-right">{l.qtd_linhas ?? "-"}</td>
                            <td className="tabular px-3 py-2 text-right">{l.extensao_km != null ? `${Number(l.extensao_km).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : "-"}</td>
                            <td className="px-3 py-2 text-right text-ink-secondary">{data(l.baixado_em)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-ink-secondary">{l.situacao === "sem_kml" ? "O SIMO não tem KML anexado" : l.mensagem ?? "Erro ao baixar"}</td>
                            <td className="px-3 py-2 text-right text-ink-secondary">{data(l.verificado_em)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                {idsPagina.length === 0 && !erroLista && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                      {termo ? "Nenhuma ação com esse ID nesta lista." : "Nada por aqui ainda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Paginacao paginaAtual={paginaAtual} totalPaginas={totalPaginas} baseHref="/arquivos-kml" params={{ aba: abaAtual.valor !== "com" ? abaAtual.valor : undefined, busca: termo || undefined }} />
        </section>
      </div>
    </AppShell>
  );
}

function Tile({ valor, rotulo, dica, cor }: { valor: number; rotulo: string; dica: string; cor: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <p className={`tabular text-2xl font-semibold ${cor}`}>{valor.toLocaleString("pt-BR")}</p>
      <p className="text-xs font-medium text-ink-primary">{rotulo}</p>
      <p className="text-[11px] text-ink-muted">{dica}</p>
    </div>
  );
}

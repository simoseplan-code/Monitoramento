"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, RotateCcw, Save, Search, X } from "lucide-react";
import { urlAcaoSimo } from "@/components/IdAcaoLink";
import {
  FILTROS,
  aditivada,
  dataDeRecebimento,
  dataSuspeita,
  estadoDeGravado,
  estadoPadrao,
  estadoParaGravar,
  filtrar,
  tipoDeRecebimento,
  valorAditivo,
  valorFinal,
  quantitativos,
  tabelaPorAno,
  valoresDosFiltros,
  type EstadoFiltros,
  type LinhaAno,
  type ObraConcluida,
} from "@/lib/analiseConcluidas";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (v: number) => brl.format(v);
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const inteiro = (v: number) => v.toLocaleString("pt-BR");

export function AnaliseConcluidas({ obras, filtroGravado }: { obras: ObraConcluida[]; filtroGravado: { estado: unknown; atualizadoEm: string } | null }) {
  const padrao = useMemo(() => estadoPadrao(obras), [obras]);
  const valores = useMemo(() => valoresDosFiltros(obras), [obras]);
  // Se a pessoa gravou um filtro, a tela já abre nele.
  const [estado, setEstado] = useState<EstadoFiltros>(() => (filtroGravado ? estadoDeGravado(filtroGravado.estado, padrao, valores) : padrao));
  const [gravadoEm, setGravadoEm] = useState<string | null>(filtroGravado?.atualizadoEm ?? null);
  const [gravadoJson, setGravadoJson] = useState<string | null>(filtroGravado ? JSON.stringify(estadoParaGravar(estadoDeGravado(filtroGravado.estado, padrao, valores))) : null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [painelAberto, setPainelAberto] = useState(true);

  const filtradas = useMemo(() => filtrar(obras, estado), [obras, estado]);
  const tabela = useMemo(() => tabelaPorAno(filtradas), [filtradas]);
  const q = useMemo(() => quantitativos(filtradas), [filtradas]);
  const semValores = obras.length > 0 && obras.every((o) => o.original == null);

  const jsonAtual = JSON.stringify(estadoParaGravar(estado));
  const alteradoDesdeAGravacao = gravadoJson !== null && gravadoJson !== jsonAtual;

  async function gravarFiltro() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tela: "analise_concluidas", estado: estadoParaGravar(estado) }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; atualizadoEm?: string };
      if (!resp.ok) setAviso({ tipo: "erro", texto: json.error ?? "Não foi possível gravar o filtro." });
      else {
        setGravadoEm(json.atualizadoEm ?? new Date().toISOString());
        setGravadoJson(jsonAtual);
        setAviso({ tipo: "ok", texto: "Filtro gravado. Quando você voltar a esta tela, ele já estará aplicado." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  async function descartarFiltroGravado() {
    setGravando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/filtros?tela=analise_concluidas", { method: "DELETE" });
      if (!resp.ok) setAviso({ tipo: "erro", texto: "Não foi possível apagar o filtro gravado." });
      else {
        setGravadoEm(null);
        setGravadoJson(null);
        setEstado(padrao);
        setAviso({ tipo: "ok", texto: "Filtro gravado apagado. A tela voltou ao padrão." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setGravando(false);
    }
  }

  const filtrosAtivos = FILTROS.filter((f) => estado.selecao[f.chave] !== null).length + (estado.pctMinimo != null ? 1 : 0) + (estado.busca ? 1 : 0) + (estado.ids.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      {semValores && (
        <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          Nenhuma obra tem valor original ou valor total ainda. Depois de rodar o SQL 0078 e sincronizar com o SIMO (Sincronizar agora na Administração), os valores aparecem aqui.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-surface px-4 py-3 shadow-card">
        <button
          onClick={gravarFiltro}
          disabled={gravando}
          className="flex items-center gap-1.5 rounded-lg bg-series-1 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          title="Grava os filtros atuais: ao sair e entrar de novo nesta tela, eles já vêm aplicados"
        >
          <Save size={13} /> {gravando ? "Gravando..." : "Gravar filtro"}
        </button>
        <span className="text-xs text-ink-muted">
          {gravadoEm
            ? alteradoDesdeAGravacao
              ? "Você mudou os filtros depois da última gravação. Clique em Gravar filtro para guardar."
              : `Filtro gravado em ${new Date(gravadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. É ele que abre quando você volta.`
            : "Nenhum filtro gravado: a tela abre sempre no padrão (OBRA, 80% ou mais, sem outros documentos)."}
        </span>
        {gravadoEm && (
          <button onClick={descartarFiltroGravado} disabled={gravando} className="text-xs font-medium text-ink-muted hover:text-ink-primary hover:underline disabled:opacity-50">
            Apagar filtro gravado
          </button>
        )}
        {aviso && <span className={`text-xs font-medium ${aviso.tipo === "ok" ? "text-status-good" : "text-status-critical"}`}>{aviso.texto}</span>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          <strong className="text-ink-primary">{inteiro(filtradas.length)}</strong> de {inteiro(obras.length)} obra(s) nos filtros atuais
        </p>
        <button
          onClick={() => setPainelAberto((a) => !a)}
          className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-plane"
        >
          <Filter size={13} /> {painelAberto ? "Esconder filtros" : "Mostrar filtros"}
          {filtrosAtivos > 0 && <span className="rounded-full bg-series-1/10 px-1.5 text-[10px] text-series-1">{filtrosAtivos}</span>}
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <TabelaPorAno linhas={tabela.linhas} geral={tabela.geral} />
          <Quantitativos q={q} />
          <ListaObras obras={filtradas} />
        </div>

        {painelAberto && (
          <PainelFiltros
            estado={estado}
            setEstado={setEstado}
            padrao={padrao}
            valores={valores}
            aoFechar={() => setPainelAberto(false)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- tabela principal ----------

function TabelaPorAno({ linhas, geral }: { linhas: LinhaAno[]; geral: LinhaAno }) {
  const th = "px-3 py-2.5 text-right text-xs font-semibold";
  return (
    <section className="rounded-xl border border-black/5 bg-surface shadow-card">
      <div className="border-b border-black/5 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">Valores calculados em cima de obras concluídas</h2>
        <p className="text-[11px] text-ink-muted">
          Ano pelo recebimento definitivo (se não houver, pelo provisório). Aditivo = valor total menos valor original; a obra é aditivada quando a diferença é maior que zero.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#7f8fb0] text-white">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold">Ano recebimento</th>
              <th className={th}>Valor total contratado</th>
              <th className={th}>Quantidade de obras analisadas</th>
              <th className={th}>Quantidade de obras aditivadas</th>
              <th className={th}>Valor total ao final da obra</th>
              <th className={th}>% sob quant.</th>
              <th className={th}>% sob valor</th>
              <th className={th}>Valor aditivado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ano} className="border-b border-black/5">
                <td className="px-3 py-2 font-medium text-ink-primary">{l.ano}</td>
                <Celulas l={l} />
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-xs text-ink-muted">
                  Nenhuma obra com os filtros atuais.
                </td>
              </tr>
            )}
            {linhas.length > 0 && (
              <tr className="border-t-2 border-black/10 bg-plane font-semibold">
                <td className="px-3 py-2.5 text-ink-primary">Total geral</td>
                <Celulas l={geral} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Celulas({ l }: { l: LinhaAno }) {
  const c = "tabular px-3 py-2 text-right";
  return (
    <>
      <td className={c}>{dinheiro(l.original)}</td>
      <td className={c}>{inteiro(l.qtd)}</td>
      <td className={c}>{inteiro(l.aditivadas)}</td>
      <td className={c}>{dinheiro(l.total)}</td>
      <td className={c}>{pct(l.pctQuant)}</td>
      <td className={c}>{pct(l.pctValor)}</td>
      <td className={c}>{dinheiro(l.aditivo)}</td>
    </>
  );
}

// ---------- quantitativos gerais ----------

function Quantitativos({ q }: { q: ReturnType<typeof quantitativos> }) {
  const itens: { rotulo: string; valor: string; dica?: string }[] = [
    { rotulo: "Obras analisadas", valor: inteiro(q.obras) },
    { rotulo: "Com valor informado", valor: inteiro(q.comValor), dica: `${inteiro(q.semValor)} sem valor original` },
    { rotulo: "Recebimento definitivo", valor: inteiro(q.definitivo) },
    { rotulo: "Só recebimento provisório", valor: inteiro(q.soProvisorio) },
    { rotulo: "Com aditivo", valor: inteiro(q.aditivadas), dica: "valor total maior que o original" },
    { rotulo: "Sem aditivo", valor: inteiro(q.semAditivo) },
    { rotulo: "Com supressão", valor: inteiro(q.suprimidas), dica: "valor total menor que o original" },
    { rotulo: "Valor médio contratado", valor: dinheiro(q.ticketMedio) },
    { rotulo: "Aditivo médio (obras aditivadas)", valor: dinheiro(q.aditivoMedioPorAditivada) },
    ...(q.datasSuspeitas > 0 ? [{ rotulo: "Datas de recebimento suspeitas", valor: inteiro(q.datasSuspeitas), dica: "ano fora de 2000 até o próximo ano: confira no SIMO" }] : []),
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-primary">Quantitativos gerais</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {itens.map((i) => (
          <div key={i.rotulo} className="rounded-xl border border-black/5 bg-surface p-4 shadow-card">
            <p className="tabular text-lg font-semibold text-ink-primary">{i.valor}</p>
            <p className="text-xs font-medium text-ink-secondary">{i.rotulo}</p>
            {i.dica && <p className="text-[11px] text-ink-muted">{i.dica}</p>}
          </div>
        ))}
      </div>
      {q.maiorAditivo && (
        <p className="rounded-xl border border-black/5 bg-surface px-4 py-3 text-xs text-ink-secondary shadow-card">
          Maior aditivo: <strong className="text-ink-primary">{dinheiro(q.maiorAditivo.valor)}</strong> na ação {q.maiorAditivo.id}
          <span className="block truncate text-ink-muted" title={q.maiorAditivo.nome}>{q.maiorAditivo.nome}</span>
        </p>
      )}

      <div className="rounded-xl border border-black/5 bg-surface shadow-card">
        <h3 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-ink-primary">Por órgão</h3>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-plane text-left text-ink-muted">
              <tr>
                <th className="px-3 py-2">Órgão</th>
                <th className="px-3 py-2 text-right">Obras</th>
                <th className="px-3 py-2 text-right">Aditivadas</th>
                <th className="px-3 py-2 text-right">Valor contratado</th>
                <th className="px-3 py-2 text-right">Valor aditivado</th>
              </tr>
            </thead>
            <tbody>
              {q.porOrgao.map((o) => (
                <tr key={o.orgao} className="border-t border-black/5">
                  <td className="px-3 py-1.5 font-medium text-ink-primary">{o.orgao}</td>
                  <td className="tabular px-3 py-1.5 text-right">{inteiro(o.qtd)}</td>
                  <td className="tabular px-3 py-1.5 text-right">{inteiro(o.aditivadas)}</td>
                  <td className="tabular px-3 py-1.5 text-right">{dinheiro(o.original)}</td>
                  <td className="tabular px-3 py-1.5 text-right">{dinheiro(o.aditivo)}</td>
                </tr>
              ))}
              {q.porOrgao.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                    Nenhuma obra com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------- coluna de filtros (como no Excel) ----------

function PainelFiltros({
  estado,
  setEstado,
  padrao,
  valores,
  aoFechar,
}: {
  estado: EstadoFiltros;
  setEstado: (e: EstadoFiltros) => void;
  padrao: EstadoFiltros;
  valores: Record<string, { valor: string; qtd: number }[]>;
  aoFechar: () => void;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set(["classificacao", "tipoOutros"]));
  const [buscaNoFiltro, setBuscaNoFiltro] = useState<Record<string, string>>({});

  const alternarAberto = (chave: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  function marcar(chave: string, valor: string, marcado: boolean) {
    const todos = valores[chave].map((v) => v.valor);
    const atual = estado.selecao[chave] ?? new Set(todos);
    const novo = new Set(atual);
    if (marcado) novo.add(valor);
    else novo.delete(valor);
    setEstado({ ...estado, selecao: { ...estado.selecao, [chave]: novo.size === todos.length ? null : novo } });
  }

  return (
    <aside className="w-full shrink-0 rounded-xl border border-black/5 bg-surface shadow-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-80 lg:overflow-y-auto">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">Filtros</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setEstado(padrao)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-plane" title="Volta ao que vem marcado de início">
            <RotateCcw size={12} /> Padrão
          </button>
          <button onClick={aoFechar} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fechar filtros">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="space-y-3 border-b border-black/5 px-4 py-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Filtrar por ID
          <textarea
            value={estado.ids}
            onChange={(e) => setEstado({ ...estado, ids: e.target.value })}
            rows={2}
            placeholder="Um ou vários IDs, separados por vírgula, espaço ou linha"
            className="mt-1 w-full rounded-lg border border-black/10 bg-plane px-2 py-1.5 font-mono text-xs font-normal normal-case text-ink-primary focus:outline-none"
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Buscar por ID ou nome
          <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-black/10 bg-plane px-2">
            <Search size={12} className="text-ink-muted" />
            <input
              value={estado.busca}
              onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
              placeholder="ID ou parte do nome..."
              className="w-full bg-transparent py-1.5 text-xs font-normal normal-case text-ink-primary focus:outline-none"
            />
          </span>
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          % de execução da ação (mínimo)
          <span className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={estado.pctMinimo ?? ""}
              onChange={(e) => setEstado({ ...estado, pctMinimo: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
              placeholder="sem corte"
              className="w-24 rounded-lg border border-black/10 bg-plane px-2 py-1.5 text-xs font-normal text-ink-primary focus:outline-none"
            />
            <span className="text-xs font-normal normal-case text-ink-muted">maior ou igual a, em %</span>
          </span>
        </label>
      </div>

      {FILTROS.map((f) => {
        const lista = valores[f.chave] ?? [];
        const sel = estado.selecao[f.chave];
        const aberto = abertos.has(f.chave);
        const termo = (buscaNoFiltro[f.chave] ?? "").toLowerCase();
        const visiveis = termo ? lista.filter((v) => v.valor.toLowerCase().includes(termo)) : lista;
        return (
          <div key={f.chave} className="border-b border-black/5 last:border-0">
            <button onClick={() => alternarAberto(f.chave)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-plane/60">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-primary">
                {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="truncate">{f.rotulo}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sel ? "bg-series-1/10 text-series-1" : "bg-plane text-ink-muted"}`}>
                {sel ? `${sel.size} de ${lista.length}` : `todos (${lista.length})`}
              </span>
            </button>
            {aberto && (
              <div className="px-4 pb-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <button onClick={() => setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: null } })} className="font-medium text-series-1 hover:underline">
                    Marcar todos
                  </button>
                  <button onClick={() => setEstado({ ...estado, selecao: { ...estado.selecao, [f.chave]: new Set() } })} className="font-medium text-ink-muted hover:underline">
                    Limpar
                  </button>
                </div>
                {lista.length > 10 && (
                  <input
                    value={buscaNoFiltro[f.chave] ?? ""}
                    onChange={(e) => setBuscaNoFiltro({ ...buscaNoFiltro, [f.chave]: e.target.value })}
                    placeholder="Pesquisar..."
                    className="mb-1.5 w-full rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-primary focus:outline-none"
                  />
                )}
                <ul className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
                  {visiveis.map((v) => (
                    <li key={v.valor}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-ink-secondary hover:bg-plane">
                        <input type="checkbox" checked={sel ? sel.has(v.valor) : true} onChange={(e) => marcar(f.chave, v.valor, e.target.checked)} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate" title={v.valor}>{v.valor}</span>
                        <span className="tabular shrink-0 text-[10px] text-ink-muted">{inteiro(v.qtd)}</span>
                      </label>
                    </li>
                  ))}
                  {visiveis.length === 0 && <li className="px-1 py-1 text-xs text-ink-muted">Nada encontrado.</li>}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

// ---------- lista simplificada das obras ----------

const ORDENACOES = [
  { valor: "id", rotulo: "ID" },
  { valor: "recebimento", rotulo: "Recebimento (mais recente)" },
  { valor: "original", rotulo: "Valor contratado (maior)" },
  { valor: "aditivo", rotulo: "Aditivo (maior)" },
] as const;

const dataBR = (iso: string | null) => {
  if (!iso) return "-";
  const partes = iso.slice(0, 10).split("-");
  return partes.length === 3 ? partes[2] + "/" + partes[1] + "/" + partes[0] : iso;
};

function ListaObras({ obras }: { obras: ObraConcluida[] }) {
  const [ordem, setOrdem] = useState<(typeof ORDENACOES)[number]["valor"]>("id");
  const [pagina, setPagina] = useState(1);
  const TAMANHO = 50;

  const ordenadas = useMemo(() => {
    const copia = [...obras];
    if (ordem === "id") copia.sort((a, b) => Number(a.id) - Number(b.id));
    else if (ordem === "recebimento") copia.sort((a, b) => (dataDeRecebimento(b) ?? "").localeCompare(dataDeRecebimento(a) ?? ""));
    else if (ordem === "original") copia.sort((a, b) => (b.original ?? 0) - (a.original ?? 0));
    else copia.sort((a, b) => valorAditivo(b) - valorAditivo(a));
    return copia;
  }, [obras, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / TAMANHO));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = ordenadas.slice((paginaAtual - 1) * TAMANHO, paginaAtual * TAMANHO);

  return (
    <section className="rounded-xl border border-black/5 bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">
          Lista das obras <span className="font-normal text-ink-muted">({inteiro(obras.length)})</span>
        </h2>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Ordenar por
          <select
            value={ordem}
            onChange={(e) => {
              setOrdem(e.target.value as typeof ordem);
              setPagina(1);
            }}
            className="rounded-lg border border-black/10 bg-plane px-2 py-1 text-xs text-ink-secondary focus:outline-none"
          >
            {ORDENACOES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-plane text-left text-ink-muted">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Ação</th>
              <th className="px-3 py-2">Órgão</th>
              <th className="px-3 py-2">Recebimento</th>
              <th className="px-3 py-2 text-right">Valor contratado</th>
              <th className="px-3 py-2 text-right">Valor final</th>
              <th className="px-3 py-2 text-right">Aditivo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((o) => {
              const ad = valorAditivo(o);
              return (
                <tr key={o.id} className="border-t border-black/5">
                  <td className="px-3 py-1.5 font-medium">
                    <a href={urlAcaoSimo(o.id)} target="_blank" rel="noopener noreferrer" title="Abrir a ação no SIMO" className="text-series-1 hover:underline">
                      {o.id}
                    </a>
                  </td>
                  <td className="max-w-xs px-3 py-1.5 text-ink-secondary">
                    <span className="block truncate" title={o.nome}>
                      {o.nome || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-ink-secondary">{o.orgao ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-secondary">
                    {dataBR(dataDeRecebimento(o))}
                    <span className="ml-1 text-ink-muted">({tipoDeRecebimento(o).toLowerCase()})</span>
                    {dataSuspeita(o) && (
                      <span title="Ano de recebimento fora do normal: confira a data no SIMO" className="ml-1 inline-flex align-middle text-status-warning">
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">{o.original != null ? dinheiro(o.original) : "-"}</td>
                  <td className="tabular px-3 py-1.5 text-right">{o.original != null ? dinheiro(valorFinal(o)) : "-"}</td>
                  <td className={"tabular px-3 py-1.5 text-right " + (aditivada(o) ? "font-medium text-status-warning" : "text-ink-muted")}>
                    {o.original != null && Math.abs(ad) > 0.005 ? dinheiro(ad) : "-"}
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                  Nenhuma obra com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-black/5 px-5 py-2.5 text-xs text-ink-muted">
          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>
          <span className="flex gap-2">
            <button onClick={() => setPagina(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
              Anterior
            </button>
            <button onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))} disabled={paginaAtual === totalPaginas} className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-plane disabled:opacity-40">
              Próxima
            </button>
          </span>
        </div>
      )}
    </section>
  );
}

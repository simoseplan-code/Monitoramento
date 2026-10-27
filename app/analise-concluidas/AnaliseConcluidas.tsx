"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, RotateCcw, Search, X } from "lucide-react";
import {
  FILTROS,
  estadoPadrao,
  filtrar,
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

export function AnaliseConcluidas({ obras }: { obras: ObraConcluida[] }) {
  const padrao = useMemo(() => estadoPadrao(obras), [obras]);
  const [estado, setEstado] = useState<EstadoFiltros>(padrao);
  const [painelAberto, setPainelAberto] = useState(true);

  const valores = useMemo(() => valoresDosFiltros(obras), [obras]);
  const filtradas = useMemo(() => filtrar(obras, estado), [obras, estado]);
  const tabela = useMemo(() => tabelaPorAno(filtradas), [filtradas]);
  const q = useMemo(() => quantitativos(filtradas), [filtradas]);
  const semValores = obras.length > 0 && obras.every((o) => o.original == null);

  const filtrosAtivos = FILTROS.filter((f) => estado.selecao[f.chave] !== null).length + (estado.pctMinimo != null ? 1 : 0) + (estado.busca ? 1 : 0);

  return (
    <div className="space-y-4">
      {semValores && (
        <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          Nenhuma obra tem valor original ou valor total ainda. Depois de rodar o SQL 0078 e sincronizar com o SIMO (Sincronizar agora na Administração), os valores aparecem aqui.
        </p>
      )}

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

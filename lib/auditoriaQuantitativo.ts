// Auditoria de tipologia × unidade de medida × quantidade (tela "Nova análise em teste").
// Lógica pura (sem tela e sem banco): recebe as obras e devolve, para cada uma, os problemas encontrados.
//
// Estratégia: nenhuma regra sozinha é perfeita, então cruzamos SEIS fontes de sinal e deixamos a pessoa ver o motivo de cada um:
//   1) cadastro        – falta unidade/quantidade, quantidade zero, unidade fora da lista do SIMO;
//   2) tipologia       – a unidade não combina com a tipologia (tabela validada pela equipe + o que a MAIORIA da base faz);
//   3) texto           – nome/descrição da ação cita "7.427,70 M²" e o cadastro diz outra coisa (inclusive erro de vírgula ×10/×100/×1000);
//   4) estatística     – quantidade e custo por unidade muito longe da mediana da própria tipologia+unidade;
//   5) limites         – quantidades impossíveis para a unidade (ex.: milhões de m²);
//   6) traçado (KML)   – quantidade em km/m muito diferente da extensão do KML da ação.

import { TIPOLOGIA_UNIDADE_MAP, UNIDADES_VALIDAS } from "@/lib/unidadeQuantidade/sugestao";

export type Gravidade = "alta" | "media" | "baixa";

export type Achado = {
  codigo: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  /** O que provavelmente está certo (para a pessoa conferir no SIMO). */
  sugestao?: string;
};

export type ObraAuditoria = {
  id: string;
  nome: string;
  descricao: string | null;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valor: number | null;
  /** Extensão (km) das linhas do KML guardado da ação, se houver. */
  kmKml: number | null;
};

export type LinhaAuditoria = {
  id: string;
  nome: string;
  orgao: string | null;
  status: string | null;
  estagio: string | null;
  tipologia: string | null;
  classificacao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valor: number | null;
  custoUnit: number | null;
  achados: Achado[];
};

export type ResumoTipologia = {
  tipologia: string;
  acoes: number;
  comProblema: number;
  unidadeDominante: string | null;
  shareDominante: number;
  medianaQtd: number | null;
  medianaCusto: number | null;
};

export const TITULOS_PROBLEMA: Record<string, string> = {
  sem_unidade: "Sem unidade de medida",
  sem_quantidade: "Sem quantidade",
  sem_ambos: "Sem unidade e sem quantidade",
  quantidade_zero: "Quantidade zero ou negativa",
  unidade_fora_padrao: "Unidade fora da lista do SIMO",
  sem_tipologia: "Sem tipologia",
  unidade_tipologia: "Unidade não combina com a tipologia",
  unidade_minoria: "Unidade diferente da maioria da tipologia",
  quantidade_texto: "Quantidade diferente do texto da ação",
  unidade_texto: "Unidade diferente do texto da ação",
  quantidade_absurda: "Quantidade impossível para a unidade",
  quantidade_outlier: "Quantidade fora do padrão da tipologia",
  unidade_fracionada: "Quantidade quebrada em UNIDADE",
  custo_unitario: "Custo por unidade fora do padrão",
  km_tracado: "Quantidade diferente do traçado (KML)",
};

// ---------- unidades ----------

const VALIDAS_MAIUSC = new Set(UNIDADES_VALIDAS.map((u) => u.toUpperCase()));

/** Unidades digitadas à mão que dá para ler como "UNIDADE" (a contagem de uma coisa). */
const COMO_UNIDADE = new Set(["ESCOLA", "QUADRA", "PRAÇA", "PRACA", "POÇO", "POCO", "PONTE", "CASA", "OBRA", "CONJUNTO", "KIT", "VEÍCULO", "VEICULO", "EQUIPAMENTO", "SISTEMA", "CISTERNA", "UBS", "UPA"]);

/** Unidade normalizada para comparar (M2 = M² = METRO QUADRADO; METRO = METROS = M; UND = UNIDADE...). null = vazio. */
export function normalizarUnidade(raw: string | null | undefined): string | null {
  const u = (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!u || u === "-" || u === "SEM UNIDADE") return null;
  if (/^(M2|M ²|M²|METROS? QUADRADOS?|METRO QUADRADO)$/.test(u)) return "M²";
  if (/^(M3|M ³|M³|METROS? C[UÚ]BICOS?)$/.test(u)) return "M³";
  if (/^(KM2|KM²|QUIL[OÔ]METROS? QUADRADOS?)$/.test(u)) return "KM²";
  if (/^(KM3|KM³)$/.test(u)) return "KM³";
  if (/^(KM|QUIL[OÔ]METROS?)$/.test(u)) return "KM";
  if (/^(M|METRO|METROS|ML|M LINEAR|METROS LINEARES)$/.test(u)) return "M";
  if (/^(UND|UN|UNID|UNIDS?|UNIDADE|UNIDADES)$/.test(u)) return "UNIDADE";
  if (/^(KG|QUILO|QUILOS|QUILOGRAMAS?)$/.test(u)) return "KG";
  if (/^(DIA|DIAS)$/.test(u)) return "DIAS";
  if (/^(HORA|HORAS|H)$/.test(u)) return "HORAS";
  if (COMO_UNIDADE.has(u)) return "UNIDADE";
  return u;
}

function foraDaLista(raw: string | null | undefined): boolean {
  const u = (raw ?? "").trim().toUpperCase();
  return !!u && u !== "-" && u !== "SEM UNIDADE" && !VALIDAS_MAIUSC.has(u);
}

function sugestaoDeUnidade(raw: string): string | undefined {
  const n = normalizarUnidade(raw);
  if (!n) return undefined;
  if (n === "M²" || n === "M³" || n === "KM²" || n === "KM³" || n === "KM" || n === "UNIDADE") return n;
  if (n === "M") return "M";
  if (n === "KG") return "Kg";
  if (n === "DIAS") return "Dias";
  if (n === "HORAS") return "Horas";
  if (COMO_UNIDADE.has(n)) return "UNIDADE";
  return undefined;
}

// Limites acima dos quais a quantidade é quase certamente um erro de digitação.
const LIMITE_ABSURDO: Record<string, number> = { KM: 1500, M: 2_000_000, "M²": 5_000_000, "M³": 5_000_000, "KM²": 100_000, UNIDADE: 5000 };

// ---------- texto da ação ----------

const NUM_BR = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?)";
const UNIDADE_NO_TEXTO = "(km\\s*²|km2|km³|km|m\\s*²|m2|m\\s*³|m3|metros?\\s+quadrados?|metros?\\s+c[uú]bicos?|metros?|m)(?![a-zA-ZÀ-ú²³0-9])";

function numeroBR(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

type CitacaoTexto = { valor: number; unidade: string; trecho: string };

/** "7.427,70 m²", "31,5 KM", "3.000 metros": o que o texto diz de medida. */
function citacoesDoTexto(texto: string): CitacaoTexto[] {
  const re = new RegExp(NUM_BR + "\\s*" + UNIDADE_NO_TEXTO, "gi");
  const saida: CitacaoTexto[] = [];
  for (const m of texto.matchAll(re)) {
    const valor = numeroBR(m[1]);
    const unidade = normalizarUnidade(m[2].replace(/\s+/g, "")) ?? normalizarUnidade(m[2]);
    if (!Number.isFinite(valor) || valor <= 0 || !unidade) continue;
    saida.push({ valor, unidade, trecho: m[0].trim() });
    if (saida.length >= 8) break;
  }
  return saida;
}

// ---------- estatística ----------

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const chaveGrupo = (tipologia: string | null, unidade: string) => `${(tipologia ?? "").trim().toUpperCase()}|${unidade}`;

const MIN_GRUPO = 8; // ações mínimas em tipologia+unidade para valer a estatística
const MIN_DOMINANTE = 15; // ações mínimas na tipologia para falar em "unidade da maioria"

type EstatGrupo = { n: number; medQtd: number; medCusto: number | null; nCusto: number };

export function auditar(obras: ObraAuditoria[]): { linhas: LinhaAuditoria[]; tipologias: ResumoTipologia[] } {
  // 1) Estatística da base: por tipologia+unidade e a unidade dominante de cada tipologia.
  const qtdPorGrupo = new Map<string, number[]>();
  const custoPorGrupo = new Map<string, number[]>();
  const unidadesPorTipologia = new Map<string, Map<string, number>>();
  for (const o of obras) {
    const un = normalizarUnidade(o.unidade);
    const tip = (o.tipologia ?? "").trim().toUpperCase();
    if (!un || !tip || !(o.quantidade != null && o.quantidade > 0)) continue;
    const g = chaveGrupo(tip, un);
    (qtdPorGrupo.get(g) ?? qtdPorGrupo.set(g, []).get(g)!).push(o.quantidade);
    if (o.valor != null && o.valor > 0) (custoPorGrupo.get(g) ?? custoPorGrupo.set(g, []).get(g)!).push(o.valor / o.quantidade);
    const mu = unidadesPorTipologia.get(tip) ?? new Map<string, number>();
    mu.set(un, (mu.get(un) ?? 0) + 1);
    unidadesPorTipologia.set(tip, mu);
  }
  const estat = new Map<string, EstatGrupo>();
  for (const [g, q] of qtdPorGrupo) {
    const c = custoPorGrupo.get(g) ?? [];
    estat.set(g, { n: q.length, medQtd: mediana(q) as number, medCusto: c.length >= MIN_GRUPO ? mediana(c) : null, nCusto: c.length });
  }
  const dominante = new Map<string, { unidade: string; share: number; n: number }>();
  for (const [tip, mu] of unidadesPorTipologia) {
    const total = Array.from(mu.values()).reduce((s, v) => s + v, 0);
    const [unidade, qtd] = Array.from(mu.entries()).sort((a, b) => b[1] - a[1])[0];
    dominante.set(tip, { unidade, share: qtd / total, n: total });
  }

  // 2) Regras, obra por obra.
  const linhas: LinhaAuditoria[] = obras.map((o) => {
    const achados: Achado[] = [];
    const add = (a: Achado) => achados.push(a);
    const tip = (o.tipologia ?? "").trim().toUpperCase();
    const un = normalizarUnidade(o.unidade);
    const q = o.quantidade;
    const temQtd = q != null && q > 0;
    const unTxt = (o.unidade ?? "").trim();
    const esperada = tip ? TIPOLOGIA_UNIDADE_MAP[tip] : undefined;
    const esperadaUn = esperada?.unidade ? normalizarUnidade(esperada.unidade) : null;
    const custoUnit = o.valor != null && o.valor > 0 && temQtd ? o.valor / (q as number) : null;

    // --- cadastro ---
    if (!tip) add({ codigo: "sem_tipologia", gravidade: "media", titulo: TITULOS_PROBLEMA.sem_tipologia, detalhe: "A ação não tem tipologia: sem ela não dá para saber a unidade esperada." });
    if (!un && (q == null || q === 0)) add({ codigo: "sem_ambos", gravidade: "media", titulo: TITULOS_PROBLEMA.sem_ambos, detalhe: "Nem unidade nem quantidade preenchidas.", sugestao: esperada?.unidade ? `Unidade esperada para ${o.tipologia}: ${esperada.unidade}` : undefined });
    else if (!un && temQtd) add({ codigo: "sem_unidade", gravidade: "alta", titulo: TITULOS_PROBLEMA.sem_unidade, detalhe: `Quantidade ${fmt(q as number)} sem unidade de medida.`, sugestao: esperada?.unidade ? `Unidade esperada para ${o.tipologia}: ${esperada.unidade}` : undefined });
    else if (un && q == null) add({ codigo: "sem_quantidade", gravidade: "media", titulo: TITULOS_PROBLEMA.sem_quantidade, detalhe: `Unidade ${unTxt} sem quantidade.` });
    if (q != null && q <= 0 && (q < 0 || un)) add({ codigo: "quantidade_zero", gravidade: "alta", titulo: TITULOS_PROBLEMA.quantidade_zero, detalhe: `Quantidade cadastrada: ${fmt(q)}.` });
    if (foraDaLista(unTxt)) {
      const s = sugestaoDeUnidade(unTxt);
      add({ codigo: "unidade_fora_padrao", gravidade: "media", titulo: TITULOS_PROBLEMA.unidade_fora_padrao, detalhe: `“${unTxt}” não é uma opção do SIMO (${UNIDADES_VALIDAS.join(", ")}).`, sugestao: s ? `Trocar por ${s}` : undefined });
    }

    // --- tipologia x unidade ---
    let flaggedTipologia = false;
    if (un && esperadaUn && un !== esperadaUn && !(esperadaUn === "M" && un === "KM")) {
      flaggedTipologia = true;
      add({
        codigo: "unidade_tipologia",
        gravidade: esperada?.confianca === "alta" ? "alta" : "media",
        titulo: TITULOS_PROBLEMA.unidade_tipologia,
        detalhe: `${o.tipologia} costuma ser em ${esperada!.unidade}, mas esta ação está em ${unTxt}.`,
        sugestao: `Conferir se a unidade deveria ser ${esperada!.unidade}${esperadaUn === "UNIDADE" ? " (quantidade 1, salvo se o texto disser outra)" : ""}`,
      });
    }
    const dom = tip ? dominante.get(tip) : undefined;
    if (!flaggedTipologia && un && dom && dom.n >= MIN_DOMINANTE && dom.share >= 0.85 && dom.unidade !== un && !(esperadaUn && esperadaUn === un)) {
      add({
        codigo: "unidade_minoria",
        gravidade: "media",
        titulo: TITULOS_PROBLEMA.unidade_minoria,
        detalhe: `${o.tipologia}: ${fmt(dom.share * 100, 0)}% das ${fmt(dom.n, 0)} ações usam ${dom.unidade}; esta usa ${unTxt}.`,
        sugestao: `Conferir se deveria ser ${dom.unidade}`,
      });
    }

    // --- texto da ação ---
    const texto = `${o.nome ?? ""} ${o.descricao ?? ""}`;
    const cit = citacoesDoTexto(texto);
    if (un && temQtd && cit.length > 0 && !(esperadaUn === "UNIDADE")) {
      const mesmas = cit.filter((c) => c.unidade === un);
      if (mesmas.length > 0) {
        const bate = mesmas.some((c) => Math.abs((q as number) - c.valor) <= Math.max(0.011, c.valor * 0.02));
        if (!bate) {
          const c0 = mesmas[0];
          const razao = (q as number) / c0.valor;
          const potencia = [10, 100, 1000, 0.1, 0.01, 0.001].find((p) => Math.abs(razao / p - 1) <= 0.02);
          add({
            codigo: "quantidade_texto",
            gravidade: "media",
            titulo: TITULOS_PROBLEMA.quantidade_texto,
            detalhe: `O texto diz “${c0.trecho}”, o cadastro tem ${fmt(q as number)} ${unTxt}.${potencia ? ` Parece erro de vírgula (×${potencia}).` : ""}`,
            sugestao: `Quantidade do texto: ${fmt(c0.valor)} ${unTxt}`,
          });
        }
      } else {
        const c0 = cit[0];
        add({
          codigo: "unidade_texto",
          gravidade: "media",
          titulo: TITULOS_PROBLEMA.unidade_texto,
          detalhe: `O texto diz “${c0.trecho}”, mas a unidade cadastrada é ${unTxt}.`,
          sugestao: `Texto sugere ${c0.unidade} com ${fmt(c0.valor)}`,
        });
      }
    }

    // --- limites e estatística ---
    if (un && temQtd) {
      const lim = LIMITE_ABSURDO[un];
      let jaAbsurda = false;
      if (lim && (q as number) > lim) {
        jaAbsurda = true;
        add({ codigo: "quantidade_absurda", gravidade: "alta", titulo: TITULOS_PROBLEMA.quantidade_absurda, detalhe: `${fmt(q as number)} ${unTxt} passa do limite razoável (${fmt(lim, 0)} ${unTxt}). Provável erro de digitação.` });
      }
      if (un === "UNIDADE" && Number.isFinite(q) && Math.abs((q as number) - Math.round(q as number)) > 0.001) {
        add({ codigo: "unidade_fracionada", gravidade: "baixa", titulo: TITULOS_PROBLEMA.unidade_fracionada, detalhe: `${fmt(q as number)} UNIDADE: contagem de coisas não costuma ter casa decimal.` });
      }
      const g = estat.get(chaveGrupo(tip, un));
      if (g && g.n >= MIN_GRUPO && tip && !jaAbsurda) {
        const r = (q as number) / g.medQtd;
        if (r >= 30 || r <= 1 / 100) {
          add({
            codigo: "quantidade_outlier",
            gravidade: r >= 300 || r <= 1 / 1000 ? "alta" : "media",
            titulo: TITULOS_PROBLEMA.quantidade_outlier,
            detalhe: `${fmt(q as number)} ${unTxt} é ${r >= 1 ? fmt(r, 0) + "× maior" : fmt(1 / r, 0) + "× menor"} que a mediana de ${o.tipologia} em ${unTxt} (${fmt(g.medQtd)}, ${fmt(g.n, 0)} ações).`,
          });
        }
        if (custoUnit != null && g.medCusto != null && g.medCusto > 0) {
          const rc = custoUnit / g.medCusto;
          if (rc >= 10 || rc <= 0.1) {
            add({
              codigo: "custo_unitario",
              gravidade: rc >= 100 || rc <= 0.01 ? "alta" : "media",
              titulo: TITULOS_PROBLEMA.custo_unitario,
              detalhe: `${brl(custoUnit)} por ${unTxt}, contra a mediana de ${brl(g.medCusto)} para ${o.tipologia} (${rc >= 1 ? fmt(rc, 0) + "× mais caro" : fmt(1 / rc, 0) + "× mais barato"}). Quantidade ou unidade podem estar erradas.`,
            });
          }
        }
      }
    }

    // --- traçado (KML) ---
    if (un && temQtd && o.kmKml != null && o.kmKml > 0.05 && (un === "KM" || un === "M")) {
      const qKm = un === "M" ? (q as number) / 1000 : (q as number);
      const r = qKm / o.kmKml;
      if (r > 1.6 || r < 0.6) {
        add({
          codigo: "km_tracado",
          gravidade: r > 3 || r < 1 / 3 ? "alta" : "media",
          titulo: TITULOS_PROBLEMA.km_tracado,
          detalhe: `Cadastro: ${fmt(qKm)} km. O KML da ação mede ${fmt(o.kmKml)} km (${r > 1 ? fmt(r, 1) + "× maior" : fmt(1 / r, 1) + "× menor"} no cadastro).`,
          sugestao: `Extensão do KML: ${fmt(o.kmKml)} km`,
        });
      }
    }

    return { id: o.id, nome: o.nome, orgao: o.orgao, status: o.status, estagio: o.estagio, tipologia: o.tipologia, classificacao: o.classificacao, unidade: o.unidade, quantidade: o.quantidade, valor: o.valor, custoUnit, achados };
  });

  // 3) Resumo por tipologia.
  const porTip = new Map<string, { acoes: number; comProblema: number; nome: string }>();
  for (const l of linhas) {
    const nome = (l.tipologia ?? "").trim() || "(sem tipologia)";
    const k = nome.toUpperCase();
    const x = porTip.get(k) ?? { acoes: 0, comProblema: 0, nome };
    x.acoes++;
    if (l.achados.length) x.comProblema++;
    porTip.set(k, x);
  }
  const tipologias: ResumoTipologia[] = Array.from(porTip.entries())
    .map(([k, x]) => {
      const d = dominante.get(k);
      const g = d ? estat.get(chaveGrupo(k, d.unidade)) : undefined;
      return { tipologia: x.nome, acoes: x.acoes, comProblema: x.comProblema, unidadeDominante: d?.unidade ?? null, shareDominante: d?.share ?? 0, medianaQtd: g?.medQtd ?? null, medianaCusto: g?.medCusto ?? null };
    })
    .sort((a, b) => b.comProblema - a.comProblema || b.acoes - a.acoes);

  return { linhas, tipologias };
}

export const PESO_GRAVIDADE: Record<Gravidade, number> = { alta: 3, media: 2, baixa: 1 };

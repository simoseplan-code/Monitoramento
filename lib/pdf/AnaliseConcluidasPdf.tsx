import React from "react";
import { Document, Text, View } from "@react-pdf/renderer";
import { C, Cartao, Kpis, Pagina, Tabela } from "@/lib/pdf/RelatorioPdf";
import type { RelatorioMontado } from "@/lib/analiseConcluidasDados";

// PDF da Análise de obras concluídas: só o relatório principal (KPIs, filtros usados, tabela por ano,
// quantitativos e órgãos).

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Nos quadros de destaque o valor vai compacto (R$ 5,82 bi, R$ 337,7 mi) para caber; a tabela traz o valor exato.
const brlCompacto = (v: number) => {
  const a = Math.abs(v);
  const f = (n: number, d: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return "R$ " + f(v / 1e9, 2) + " bi";
  if (a >= 1e6) return "R$ " + f(v / 1e6, 1) + " mi";
  return brl(v);
};
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function AnaliseConcluidasPdf({ r, geradoEm, geradoPor }: { r: RelatorioMontado; geradoEm: string; geradoPor: string }) {
  const g = r.tabela.geral;
  const q = r.q;
  const subtitulo = `${r.filtradas.length.toLocaleString("pt-BR")} obra(s) de ${r.totalNaBase.toLocaleString("pt-BR")} com recebimento · gerado por ${geradoPor}`;

  return (
    <Document title="Análise de obras concluídas: Monitoramento de Obras" author="Monitoramento de Obras">
      <Pagina titulo="Análise de obras concluídas" subtitulo={subtitulo} geradoEm={geradoEm}>
        <Kpis
          itens={[
            { rotulo: "Obras analisadas", valor: g.qtd, cor: C.azul },
            { rotulo: "Valor total contratado", valor: brlCompacto(g.original), cor: C.violeta },
            { rotulo: "Valor ao final da obra", valor: brlCompacto(g.total), cor: C.aqua },
            { rotulo: "Valor aditivado", valor: brlCompacto(g.aditivo), cor: C.laranja },
            { rotulo: `Obras aditivadas (${pct(g.pctQuant)})`, valor: g.aditivadas, cor: C.amarelo },
          ]}
        />

        <View style={{ marginBottom: 8 }}>
          <Cartao titulo="Filtros aplicados" sub="O que está marcado nesta análise">
            {r.filtros.map((f) => (
              <Text key={f} style={{ fontSize: 7.8, color: C.texto2, marginBottom: 1.5 }}>
                • {f}
              </Text>
            ))}
          </Cartao>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Cartao titulo="Valores calculados em cima de obras concluídas" sub="Ano pelo recebimento provisório (se não houver, pelo definitivo). Aditivo = valor total menos valor original.">
            <Tabela
              colunas={[
                { titulo: "Ano", flex: 0.9 },
                { titulo: "Valor contratado", flex: 2.1, direita: true },
                { titulo: "Obras", flex: 0.9, direita: true },
                { titulo: "Aditivadas", flex: 1, direita: true },
                { titulo: "Valor final", flex: 2.1, direita: true },
                { titulo: "% quant.", flex: 1, direita: true },
                { titulo: "% valor", flex: 1, direita: true },
                { titulo: "Valor aditivado", flex: 2, direita: true },
              ]}
              linhas={[
                ...r.tabela.linhas.map((l) => [l.ano, brl(l.original), l.qtd, l.aditivadas, brl(l.total), pct(l.pctQuant), pct(l.pctValor), brl(l.aditivo)]),
                ["TOTAL", brl(g.original), g.qtd, g.aditivadas, brl(g.total), pct(g.pctQuant), pct(g.pctValor), brl(g.aditivo)],
              ]}
              vazio="Nenhuma obra nos filtros atuais."
            />
          </Cartao>
        </View>

        <Kpis
          itens={[
            { rotulo: "Com valor informado", valor: q.comValor, cor: C.azul },
            { rotulo: "Recebimento definitivo", valor: q.definitivo, cor: C.verde },
            { rotulo: "Só provisório", valor: q.soProvisorio, cor: C.amarelo },
            { rotulo: "Sem aditivo", valor: q.semAditivo, cor: C.neutro },
            { rotulo: "Com supressão", valor: q.suprimidas, cor: C.vermelho },
          ]}
        />
        <Kpis
          itens={[
            { rotulo: "Valor médio contratado", valor: brlCompacto(q.ticketMedio), cor: C.violeta },
            { rotulo: "Aditivo médio (aditivadas)", valor: brlCompacto(q.aditivoMedioPorAditivada), cor: C.laranja },
            { rotulo: "Datas de recebimento suspeitas", valor: q.datasSuspeitas, cor: q.datasSuspeitas ? C.vermelho : C.neutro },
          ]}
        />

        <Cartao titulo="Por órgão" sub={`Os ${Math.min(15, q.porOrgao.length)} órgãos com mais obras`}>
          <Tabela
            colunas={[
              { titulo: "Órgão", flex: 2.2 },
              { titulo: "Obras", flex: 0.8, direita: true },
              { titulo: "Aditivadas", flex: 1, direita: true },
              { titulo: "Valor contratado", flex: 2, direita: true },
              { titulo: "Valor aditivado", flex: 2, direita: true },
            ]}
            linhas={q.porOrgao.slice(0, 15).map((o) => [o.orgao, o.qtd, o.aditivadas, brl(o.original), brl(o.aditivo)])}
            vazio="Nenhuma obra nos filtros atuais."
          />
        </Cartao>
      </Pagina>

    </Document>
  );
}

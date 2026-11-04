import React from "react";
import { Document, Text, View } from "@react-pdf/renderer";
import { C, Cartao, Kpis, Pagina, Tabela } from "@/lib/pdf/RelatorioPdf";

// PDF da lista do Mapa geral: as obras do filtro com os dados principais (descrição, valores, georreferenciamento).

export const LIMITE_PDF_TERRITORIO = 1200;

export type LinhaPdfTerritorio = {
  id: string;
  nome: string;
  orgao: string;
  territorios: string;
  status: string;
  tipologia: string;
  georref: string;
  contratado: number | null;
  total: number | null;
  pago: number | null;
  execucao: string;
};

const curto = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const reais = (v: number | null) => (v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const soma = (l: LinhaPdfTerritorio[], k: "contratado" | "total" | "pago") => l.reduce((s, x) => s + (x[k] ?? 0), 0);

export function TerritorioPdf({ linhas, filtros, geradoEm, geradoPor }: { linhas: LinhaPdfTerritorio[]; filtros: string[]; geradoEm: string; geradoPor: string }) {
  const lista = linhas.slice(0, LIMITE_PDF_TERRITORIO);
  const cortada = linhas.length > lista.length;
  const georref = linhas.filter((l) => l.georref.startsWith("Sim")).length;
  return (
    <Document title="Mapa geral: Monitoramento de Obras" author="Monitoramento de Obras">
      <Pagina titulo="Mapa geral: lista de obras" subtitulo={`${linhas.length.toLocaleString("pt-BR")} obra(s) · gerado por ${geradoPor}`} geradoEm={geradoEm} paisagem>
        <Kpis
          itens={[
            { rotulo: "Obras na lista", valor: linhas.length.toLocaleString("pt-BR"), cor: C.azul },
            { rotulo: "Valor contratado", valor: reais(soma(linhas, "contratado")), cor: C.neutro },
            { rotulo: "Valor total do contrato", valor: reais(soma(linhas, "total")), cor: C.azul },
            { rotulo: "Valor pago", valor: reais(soma(linhas, "pago")), cor: C.verde },
            { rotulo: "Georreferenciadas", valor: georref.toLocaleString("pt-BR"), cor: C.verde },
            { rotulo: "Sem georreferenciamento", valor: (linhas.length - georref).toLocaleString("pt-BR"), cor: C.vermelho },
          ]}
        />
        <View style={{ marginBottom: 8 }}>
          <Cartao titulo="Filtros aplicados" sub="O que está marcado nesta lista">
            {filtros.map((f) => (
              <Text key={f} style={{ fontSize: 7.8, color: C.texto2, marginBottom: 1.5 }}>
                • {f}
              </Text>
            ))}
          </Cartao>
        </View>
        {cortada && (
          <Text style={{ fontSize: 7.5, color: C.vermelho, marginBottom: 6 }}>
            A lista tem {linhas.length.toLocaleString("pt-BR")} obras; o PDF mostra as primeiras {LIMITE_PDF_TERRITORIO.toLocaleString("pt-BR")}. Use mais filtros para ver o resto.
          </Text>
        )}
        <Tabela
          colunas={[
            { titulo: "ID", flex: 0.6 },
            { titulo: "Descrição", flex: 3.4 },
            { titulo: "Órgão", flex: 0.8 },
            { titulo: "Território(s)", flex: 1.5 },
            { titulo: "Status", flex: 0.9 },
            { titulo: "Tipologia", flex: 1.1 },
            { titulo: "Georreferenciada", flex: 1 },
            { titulo: "Contratado", flex: 1.1, direita: true },
            { titulo: "Total do contrato", flex: 1.1, direita: true },
            { titulo: "Pago", flex: 1.1, direita: true },
            { titulo: "Exec.", flex: 0.5, direita: true },
          ]}
          linhas={lista.map((l) => [l.id, curto(l.nome || "-", 110), l.orgao || "-", curto(l.territorios || "-", 50), l.status || "-", curto(l.tipologia || "-", 28), l.georref, reais(l.contratado), reais(l.total), reais(l.pago), l.execucao || "-"])}
          vazio="Nenhuma obra nos filtros atuais."
        />
      </Pagina>
    </Document>
  );
}

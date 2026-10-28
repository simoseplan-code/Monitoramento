import React from "react";
import { Document, Text, View } from "@react-pdf/renderer";
import { C, Cartao, Kpis, Pagina, Tabela } from "@/lib/pdf/RelatorioPdf";
import { vinculacao } from "@/lib/acoesFiltro";
import type { ListagemMontada } from "@/lib/acoesDados";

// PDF da tela Ações: a lista do que está filtrado (ex.: concluídas que não estão vinculadas).

export const LIMITE_PDF = 1200;

const curto = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

export function AcoesPdf({ r, geradoEm, geradoPor }: { r: ListagemMontada; geradoEm: string; geradoPor: string }) {
  const lista = r.filtradas.slice(0, LIMITE_PDF);
  const cortada = r.filtradas.length > lista.length;
  const subtitulo = `${r.filtradas.length.toLocaleString("pt-BR")} ação(ões) de ${r.totalNaBase.toLocaleString("pt-BR")} · gerado por ${geradoPor}`;
  return (
    <Document title="Ações: Monitoramento de Obras" author="Monitoramento de Obras">
      <Pagina titulo="Ações" subtitulo={subtitulo} geradoEm={geradoEm}>
        <Kpis
          itens={[
            { rotulo: "Ações na lista", valor: r.filtradas.length, cor: C.azul },
            { rotulo: "Vinculadas", valor: r.contagem.vinculadas, cor: C.verde },
            { rotulo: "Não vinculadas", valor: r.contagem.naoVinculadas, cor: C.vermelho },
            { rotulo: "Pendentes (com nº SIAFE)", valor: r.contagem.pendentes, cor: C.aviso },
            { rotulo: "Sem número", valor: r.contagem.semNumero, cor: C.neutro },
          ]}
        />
        <View style={{ marginBottom: 8 }}>
          <Cartao titulo="Filtros aplicados" sub="O que está marcado nesta lista">
            {r.filtros.map((f) => (
              <Text key={f} style={{ fontSize: 7.8, color: C.texto2, marginBottom: 1.5 }}>
                • {f}
              </Text>
            ))}
          </Cartao>
        </View>
        {cortada && (
          <Text style={{ fontSize: 7.5, color: C.vermelho, marginBottom: 6 }}>
            A lista tem {r.filtradas.length.toLocaleString("pt-BR")} ações; o PDF mostra as primeiras {LIMITE_PDF.toLocaleString("pt-BR")}. Use mais filtros ou o Excel para ver todas.
          </Text>
        )}
        <Tabela
          colunas={[
            { titulo: "ID", flex: 0.7 },
            { titulo: "Nome da ação", flex: 3.6 },
            { titulo: "Órgão", flex: 1 },
            { titulo: "Nº SIAFE", flex: 1 },
            { titulo: "Status", flex: 1 },
            { titulo: "Situação", flex: 1 },
          ]}
          linhas={lista.map((a) => [a.id, curto(a.nome || "-", 95), a.orgao ?? "-", a.numeroSiafe ?? "-", a.status ?? "-", vinculacao(a)])}
          vazio="Nenhuma ação nos filtros atuais."
        />
      </Pagina>
    </Document>
  );
}

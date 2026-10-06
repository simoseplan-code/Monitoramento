import React from "react";
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Mesma paleta do painel (app/globals.css).
const C = {
  plano: "#f7f8fa",
  borda: "#e4e4df",
  texto: "#0b0b0b",
  texto2: "#52514e",
  mudo: "#898781",
  grade: "#e1e0d9",
  azul: "#2a78d6",
  aviso: "#d98c00",
  avisoFundo: "#fef3dd",
};

export type AcaoPendente = {
  idAcao: string;
  nomeAcao: string;
  dataCriacao: string | null;
  responsavel: string | null;
  encaminhadaEm: string;
  itens: string[];
};
export type OrgaoPendente = { orgao: string; acoes: AcaoPendente[] };

const s = StyleSheet.create({
  pagina: { backgroundColor: C.plano, padding: 28, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: C.texto },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  marca: { flexDirection: "row", alignItems: "center", flex: 1 },
  logo: { width: 22, height: 22, borderRadius: 6, backgroundColor: C.azul, marginRight: 8 },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 8, color: C.mudo, marginTop: 2 },
  etiqueta: { fontSize: 7.5, color: C.mudo, textAlign: "right" },
  intro: { fontSize: 8.5, color: C.texto2, marginBottom: 10, lineHeight: 1.4 },
  linhaCab: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.grade, paddingBottom: 3, marginBottom: 2 },
  cab: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.mudo },
  linha: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.4, borderBottomColor: C.grade },
  rodape: { position: "absolute", left: 28, right: 28, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.mudo },
});

const dia = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "-");

function Cabecalho({ titulo, subtitulo, geradoEm }: { titulo: string; subtitulo: string; geradoEm: string }) {
  return (
    <View style={s.topo} fixed>
      <View style={s.marca}>
        <View style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{titulo}</Text>
          <Text style={s.subtitulo}>{subtitulo}</Text>
        </View>
      </View>
      <View>
        <Text style={[s.etiqueta, { fontFamily: "Helvetica-Bold", color: C.texto2 }]}>Monitoramento de Obras</Text>
        <Text style={s.etiqueta}>Gerado em {geradoEm}</Text>
      </View>
    </View>
  );
}

function Rodape({ geradoEm }: { geradoEm: string }) {
  return (
    <View style={s.rodape} fixed>
      <Text>Relatório de pendências · {geradoEm}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

// Uma seção (um ou mais páginas) por órgão: só as ações encaminhadas e, em cada
// uma, só os itens que foram marcados como pendentes.
export function PendenciasPdf({ orgaos, geradoEm }: { orgaos: OrgaoPendente[]; geradoEm: string }) {
  return (
    <Document title="Pendências por órgão: Monitoramento de Obras" author="Monitoramento de Obras">
      {orgaos.map((o) => (
        <Page key={o.orgao} size="A4" style={s.pagina}>
          <Cabecalho
            titulo={`Pendências: ${o.orgao}`}
            subtitulo={`${o.acoes.length} ação(ões) aguardando solução de pendência`}
            geradoEm={geradoEm}
          />
          <Text style={s.intro}>
            As ações abaixo foram analisadas e têm item(ns) pendente(s) de correção ou complemento. Para cada ação estão listados somente
            os itens marcados como pendentes.
          </Text>

          <View style={s.linhaCab}>
            <Text style={[s.cab, { width: 46 }]}>ID</Text>
            <Text style={[s.cab, { flex: 3 }]}>AÇÃO</Text>
            <Text style={[s.cab, { width: 56 }]}>CRIADA EM</Text>
            <Text style={[s.cab, { flex: 2.2 }]}>PENDÊNCIA(S)</Text>
          </View>

          {o.acoes.map((a) => (
            <View key={a.idAcao} style={s.linha} wrap={false}>
              <View style={{ width: 46 }}>
                <Link src={`http://simo.pi.gov.br/cahier/action/projects/show/id/${encodeURIComponent(a.idAcao)}`} style={{ color: C.azul, fontSize: 8, fontFamily: "Helvetica-Bold", textDecoration: "none" }}>
                  {a.idAcao}
                </Link>
              </View>
              <Text style={{ flex: 3, fontSize: 8, paddingRight: 8, lineHeight: 1.3 }}>{a.nomeAcao}</Text>
              <Text style={{ width: 56, fontSize: 8, color: C.texto2 }}>{dia(a.dataCriacao)}</Text>
              <View style={{ flex: 2.2 }}>
                {a.itens.map((item) => (
                  <View key={item} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 2 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.aviso, marginRight: 5, marginTop: 2.5 }} />
                    <Text style={{ flex: 1, fontSize: 8, color: C.texto }}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Rodape geradoEm={geradoEm} />
        </Page>
      ))}
    </Document>
  );
}

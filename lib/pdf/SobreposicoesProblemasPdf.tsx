import React from "react";
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ParComProblema } from "@/lib/sobreposicoes/relatorioProblemas";

// Mesma paleta do painel (app/globals.css).
const C = {
  plano: "#f7f8fa",
  texto: "#0b0b0b",
  texto2: "#52514e",
  mudo: "#898781",
  grade: "#e1e0d9",
  azul: "#2a78d6",
  aviso: "#d98c00",
  avisoFundo: "#fef3dd",
};

const s = StyleSheet.create({
  pagina: { backgroundColor: C.plano, padding: 28, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: C.texto },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  logo: { width: 22, height: 22, borderRadius: 6, backgroundColor: C.azul, marginRight: 8 },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 8, color: C.mudo, marginTop: 2 },
  etiqueta: { fontSize: 7.5, color: C.mudo, textAlign: "right" },
  intro: { fontSize: 8.5, color: C.texto2, marginBottom: 8, lineHeight: 1.4 },
  linhaCab: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.grade, paddingBottom: 3, marginBottom: 2 },
  cab: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.mudo },
  linha: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.4, borderBottomColor: C.grade },
  rodape: { position: "absolute", left: 28, right: 28, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.mudo },
  caixaResumo: { flexDirection: "row", gap: 8, marginBottom: 10 },
  numero: { backgroundColor: "#ffffff", borderRadius: 6, padding: 8, flex: 1, borderWidth: 0.5, borderColor: C.grade },
});

const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "-");
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const urlSimo = (id: string) => `http://simo.pi.gov.br/cahier/action/projects/show/id/${encodeURIComponent(id)}`;

function Cabecalho({ geradoEm, total }: { geradoEm: string; total: number }) {
  return (
    <View style={s.topo} fixed>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Sobreposições com problema</Text>
          <Text style={s.subtitulo}>{inteiro(total)} par(es) de obras aguardando solução</Text>
        </View>
      </View>
      <View>
        <Text style={[s.etiqueta, { fontFamily: "Helvetica-Bold", color: C.texto2 }]}>Monitoramento de Obras</Text>
        <Text style={s.etiqueta}>Gerado em {geradoEm}</Text>
      </View>
    </View>
  );
}

export function SobreposicoesProblemasPdf({ pares, geradoEm }: { pares: ParComProblema[]; geradoEm: string }) {
  const metros = pares.reduce((t, p) => t + (p.extensaoM ?? 0), 0);
  const porOrgao = new Map<string, number>();
  for (const p of pares) for (const o of p.orgaos) porOrgao.set(o, (porOrgao.get(o) ?? 0) + 1);
  const topOrgaos = Array.from(porOrgao.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Document title="Sobreposições com problema: Monitoramento de Obras" author="Monitoramento de Obras">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Cabecalho geradoEm={geradoEm} total={pares.length} />
        <Text style={s.intro}>
          Cada linha é um par de obras (ID × ID) que se sobrepõem no mapa e foi analisado como COM PROBLEMA. Os trechos onde as mesmas obras se
          sobrepõem aparecem juntos, com os metros somados. Em cada par, a primeira ação (menor ID) é a principal, normalmente a original.
        </Text>

        <View style={s.caixaResumo}>
          <View style={s.numero}>
            <Text style={{ fontSize: 7, color: C.mudo }}>PARES COM PROBLEMA</Text>
            <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: C.aviso }}>{inteiro(pares.length)}</Text>
          </View>
          <View style={s.numero}>
            <Text style={{ fontSize: 7, color: C.mudo }}>METROS SOBREPOSTOS (SOMA)</Text>
            <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold" }}>{inteiro(metros)} m</Text>
          </View>
          <View style={[s.numero, { flex: 3 }]}>
            <Text style={{ fontSize: 7, color: C.mudo, marginBottom: 2 }}>PARES POR ÓRGÃO (um par conta para cada órgão envolvido)</Text>
            <Text style={{ fontSize: 8, lineHeight: 1.4 }}>{topOrgaos.slice(0, 12).map(([o, n]) => `${o}: ${n}`).join("  ·  ") || "-"}</Text>
          </View>
        </View>

        <View style={s.linhaCab}>
          <Text style={[s.cab, { width: 22 }]}>Nº</Text>
          <Text style={[s.cab, { flex: 4.2 }]}>AÇÕES DO PAR</Text>
          <Text style={[s.cab, { width: 62 }]}>SOBREPOSTO</Text>
          <Text style={[s.cab, { flex: 2.6 }]}>PROBLEMA REGISTRADO</Text>
          <Text style={[s.cab, { width: 70 }]}>RESPONSÁVEL</Text>
        </View>

        {pares.map((p, i) => (
          <View key={p.chave} style={s.linha} wrap={false}>
            <Text style={{ width: 22, fontSize: 8, color: C.mudo }}>{i + 1}</Text>
            <View style={{ flex: 4.2, paddingRight: 8 }}>
              {p.obras.map((o) => (
                <View key={o.id} style={{ marginBottom: 3 }}>
                  <Text style={{ fontSize: 8, lineHeight: 1.3 }}>
                    <Link src={urlSimo(o.id)} style={{ color: C.azul, fontFamily: "Helvetica-Bold", textDecoration: "none" }}>
                      {o.id}
                    </Link>
                    {o.principal ? "  (principal)" : ""}  {o.nome}
                  </Text>
                  <Text style={{ fontSize: 7, color: C.mudo }}>
                    {o.orgao} · {o.status}
                    {o.percentual != null ? ` · ${o.percentual.toLocaleString("pt-BR")}% executado` : ""} · {o.contrato}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ width: 62 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{p.extensaoM != null ? `${inteiro(p.extensaoM)} m` : "-"}</Text>
              <Text style={{ fontSize: 7, color: C.mudo }}>{p.trechos} trecho(s)</Text>
            </View>
            <Text style={{ flex: 2.6, fontSize: 8, color: p.observacao ? C.texto : C.mudo, lineHeight: 1.3, paddingRight: 6 }}>{p.observacao || "(sem observação)"}</Text>
            <View style={{ width: 70 }}>
              <Text style={{ fontSize: 8 }}>{p.responsavel || "-"}</Text>
              <Text style={{ fontSize: 7, color: C.mudo }}>{dia(p.analisadoEm)}</Text>
            </View>
          </View>
        ))}

        {pares.length === 0 && <Text style={{ marginTop: 20, fontSize: 10, color: C.mudo }}>Nenhum par com problema no momento.</Text>}

        <View style={s.rodape} fixed>
          <Text>Sobreposições com problema · {geradoEm}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

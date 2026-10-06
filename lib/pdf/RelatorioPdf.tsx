import React from "react";
import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { DadosRelatorioPdf, Par } from "@/lib/relatorioDados";
import { formatarDia } from "@/lib/desempenho";

export type TipoPdf = "completo" | "novas_acoes" | "sobreposicoes" | "termos";

// Mesma paleta do painel (app/globals.css).
const C = {
  plano: "#f7f8fa",
  cartao: "#ffffff",
  borda: "#e4e4df",
  texto: "#0b0b0b",
  texto2: "#52514e",
  mudo: "#898781",
  grade: "#e1e0d9",
  azul: "#2a78d6",
  laranja: "#eb6834",
  aqua: "#1baf7a",
  amarelo: "#eda100",
  violeta: "#4a3aa7",
  vermelho: "#d03b3b",
  verde: "#0ca30c",
  aviso: "#d98c00",
  neutro: "#6b6a66",
};

const s = StyleSheet.create({
  pagina: { backgroundColor: C.plano, padding: 28, paddingBottom: 44, fontFamily: "Helvetica", fontSize: 9, color: C.texto },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  marca: { flexDirection: "row", alignItems: "center" },
  logo: { width: 22, height: 22, borderRadius: 6, backgroundColor: C.azul, marginRight: 8 },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 8, color: C.mudo, marginTop: 2 },
  etiqueta: { fontSize: 7.5, color: C.mudo, textAlign: "right" },
  cartao: { backgroundColor: C.cartao, borderRadius: 8, borderWidth: 0.6, borderColor: C.borda, padding: 10 },
  cartaoTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  cartaoSub: { fontSize: 7.5, color: C.mudo, marginTop: 1, marginBottom: 8 },
  linha: { flexDirection: "row", marginBottom: 8 },
  rodape: { position: "absolute", left: 28, right: 28, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.mudo },
});

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "0%");

function Pagina({ titulo, subtitulo, geradoEm, children }: { titulo: string; subtitulo: string; geradoEm: string; children: React.ReactNode }) {
  return (
    <Page size="A4" style={s.pagina}>
      <View style={s.topo}>
        <View style={s.marca}>
          <View style={s.logo} />
          <View>
            <Text style={s.titulo}>{titulo}</Text>
            <Text style={s.subtitulo}>{subtitulo}</Text>
          </View>
        </View>
        <View>
          <Text style={[s.etiqueta, { fontFamily: "Helvetica-Bold", color: C.texto2 }]}>Monitoramento de Obras</Text>
          <Text style={s.etiqueta}>Gerado em {geradoEm}</Text>
        </View>
      </View>
      {children}
      <View style={s.rodape} fixed>
        <Text>Monitoramento de Obras · retrato do sistema em {geradoEm}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}

function Cartao({ titulo, sub, children, flex, mr = 0 }: { titulo?: string; sub?: string; children: React.ReactNode; flex?: number; mr?: number }) {
  return (
    <View style={[s.cartao, flex !== undefined ? { flex } : {}, { marginRight: mr }]} wrap={false}>
      {titulo && <Text style={s.cartaoTitulo}>{titulo}</Text>}
      {sub && <Text style={s.cartaoSub}>{sub}</Text>}
      {children}
    </View>
  );
}

function Kpis({ itens }: { itens: { rotulo: string; valor: string | number; cor: string }[] }) {
  return (
    <View style={[s.linha, { flexWrap: "wrap" }]}>
      {itens.map((k, i) => (
        <View
          key={k.rotulo}
          style={[s.cartao, { flex: 1, minWidth: 80, marginRight: i < itens.length - 1 ? 6 : 0, padding: 8, borderTopWidth: 2.5, borderTopColor: k.cor }]}
          wrap={false}
        >
          <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", color: C.texto }}>{typeof k.valor === "number" ? num(k.valor) : k.valor}</Text>
          <Text style={{ fontSize: 7.5, color: C.mudo, marginTop: 2 }}>{k.rotulo}</Text>
        </View>
      ))}
    </View>
  );
}

function arco(cx: number, cy: number, r: number, ri: number, a0: number, a1: number) {
  const p = (a: number, rad: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const fim = Math.min(a1, a0 + Math.PI * 2 - 0.0001);
  const [x0, y0] = p(a0, r);
  const [x1, y1] = p(fim, r);
  const [x2, y2] = p(fim, ri);
  const [x3, y3] = p(a0, ri);
  const grande = fim - a0 > Math.PI ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${grande} 1 ${x1} ${y1} L${x2} ${y2} A${ri} ${ri} 0 ${grande} 0 ${x3} ${y3} Z`;
}

function Rosca({ itens, centro }: { itens: { nome: string; valor: number; cor: string }[]; centro?: string }) {
  const total = itens.reduce((t, i) => t + i.valor, 0);
  const tam = 96;
  let ang = -Math.PI / 2;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: tam, height: tam, position: "relative" }}>
        <Svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`}>
          {total === 0 ? (
            <Path d={arco(tam / 2, tam / 2, 46, 28, -Math.PI / 2, Math.PI * 1.5)} fill={C.grade} />
          ) : (
            itens
              .filter((i) => i.valor > 0)
              .map((i) => {
                const a0 = ang;
                ang += (i.valor / total) * Math.PI * 2;
                return <Path key={i.nome} d={arco(tam / 2, tam / 2, 46, 28, a0, ang)} fill={i.cor} />;
              })
          )}
        </Svg>
        <View style={{ position: "absolute", left: 0, top: 0, width: tam, height: tam, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{centro ?? num(total)}</Text>
          <Text style={{ fontSize: 6.5, color: C.mudo }}>total</Text>
        </View>
      </View>
      <View style={{ marginLeft: 12, flex: 1 }}>
        {itens.map((i) => (
          <View key={i.nome} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i.cor, marginRight: 5 }} />
            <Text style={{ flex: 1, fontSize: 8, color: C.texto2 }}>{i.nome}</Text>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>
              {num(i.valor)} <Text style={{ color: C.mudo, fontFamily: "Helvetica" }}>({pct(i.valor, total)})</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BarrasH({ itens, cor = C.azul, vazio = "Sem dados." }: { itens: Par[]; cor?: string; vazio?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (itens.length === 0) return <Text style={{ fontSize: 8, color: C.mudo }}>{vazio}</Text>;
  return (
    <View>
      {itens.map((i) => (
        <View key={i.nome} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }} wrap={false}>
          <Text style={{ width: 100, fontSize: 7.5, color: C.texto2 }}>{i.nome.length > 25 ? `${i.nome.slice(0, 24)}.` : i.nome}</Text>
          <View style={{ flex: 1, height: 8, backgroundColor: C.plano, borderRadius: 3 }}>
            <View style={{ width: `${(i.valor / max) * 100}%`, height: 8, backgroundColor: cor, borderRadius: 3 }} />
          </View>
          <Text style={{ width: 34, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{num(i.valor)}</Text>
        </View>
      ))}
    </View>
  );
}

type Segmento = { nome: string; cor: string };
function Empilhadas({ linhas, segmentos }: { linhas: { rotulo: string; valores: number[] }[]; segmentos: Segmento[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.valores.reduce((a, b) => a + b, 0)));
  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 5 }}>
        {segmentos.map((g) => (
          <View key={g.nome} style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.cor, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: C.texto2 }}>{g.nome}</Text>
          </View>
        ))}
      </View>
      {linhas.length === 0 && <Text style={{ fontSize: 8, color: C.mudo }}>Sem dados.</Text>}
      {linhas.map((l) => {
        const soma = l.valores.reduce((a, b) => a + b, 0);
        return (
          <View key={l.rotulo} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }} wrap={false}>
            <Text style={{ width: 100, fontSize: 7.5, color: C.texto2 }}>{l.rotulo.length > 25 ? `${l.rotulo.slice(0, 24)}.` : l.rotulo}</Text>
            <View style={{ flex: 1, flexDirection: "row", height: 8, backgroundColor: C.plano, borderRadius: 3 }}>
              {l.valores.map((v, i) => (
                <View key={i} style={{ width: `${(v / max) * 100}%`, height: 8, backgroundColor: segmentos[i].cor }} />
              ))}
            </View>
            <Text style={{ width: 34, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{num(soma)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Colunas({ itens, cor = C.azul }: { itens: Par[]; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 84 }}>
      {itens.map((i) => (
        <View key={i.nome} style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 7, color: C.texto2, marginBottom: 2 }}>{i.valor}</Text>
          <View style={{ width: 16, height: Math.max(2, (i.valor / max) * 58), backgroundColor: cor, borderRadius: 2 }} />
          <Text style={{ fontSize: 7, color: C.mudo, marginTop: 3 }}>{i.nome}</Text>
        </View>
      ))}
    </View>
  );
}

type Col = { titulo: string; flex?: number; direita?: boolean; cor?: string };
function Tabela({ colunas, linhas, vazio = "Nada a mostrar." }: { colunas: Col[]; linhas: (string | number)[][]; vazio?: string }) {
  return (
    <View>
      <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.grade, paddingBottom: 3, marginBottom: 2 }}>
        {colunas.map((c) => (
          <Text key={c.titulo} style={{ flex: c.flex ?? 1, fontSize: 6.8, fontFamily: "Helvetica-Bold", color: c.cor ?? C.mudo, textAlign: c.direita ? "right" : "left", paddingRight: 4 }}>
            {c.titulo.toUpperCase()}
          </Text>
        ))}
      </View>
      {linhas.length === 0 && <Text style={{ fontSize: 8, color: C.mudo, paddingTop: 4 }}>{vazio}</Text>}
      {linhas.map((l, i) => (
        <View key={i} style={{ flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: C.grade }} wrap={false}>
          {l.map((v, j) => (
            <Text key={j} style={{ flex: colunas[j].flex ?? 1, fontSize: 7.6, textAlign: colunas[j].direita ? "right" : "left", paddingRight: 4, color: j === 0 ? C.texto : C.texto2, fontFamily: j === 0 ? "Helvetica-Bold" : "Helvetica" }}>
              {typeof v === "number" ? num(v) : v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ───────────────────────── páginas ─────────────────────────
function PaginaGestao({ d }: { d: DadosRelatorioPdf }) {
  const g = d.gestao;
  const na = d.novasAcoes;
  const so = d.sobreposicoes;
  const te = d.termos;
  return (
    <Pagina titulo="Visão geral da gestão" subtitulo="Ações criadas de 2023 em diante" geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Ações (2023+)", valor: g.total2023, cor: C.azul },
          { rotulo: "Vinculadas", valor: g.vinculadas, cor: C.verde },
          { rotulo: "Pendentes", valor: g.pendentes, cor: C.aviso },
          { rotulo: "Sem número", valor: g.semNumero, cor: C.neutro },
          { rotulo: "Dado incorreto", valor: g.dadoIncorreto, cor: C.vermelho },
          { rotulo: "Órgãos", valor: g.orgaos, cor: C.violeta },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Situação da vinculação" sub="Número do contrato SIAFE x Número Automático (2023+)" flex={1} mr={8}>
          <Rosca
            itens={[
              { nome: "Vinculadas", valor: g.vinculadas, cor: C.verde },
              { nome: "Pendentes", valor: g.pendentes, cor: C.amarelo },
              { nome: "Sem número", valor: g.semNumero, cor: C.neutro },
              { nome: "Dado incorreto", valor: g.dadoIncorreto, cor: C.vermelho },
            ]}
          />
        </Cartao>
        <Cartao titulo="Status das ações no SIMO" sub="Por situação cadastrada (2023+)" flex={1}>
          <BarrasH itens={g.status.slice(0, 8)} cor={C.azul} />
        </Cartao>
      </View>
      <Cartao titulo="Andamento das análises da equipe" sub="O que está concluído e o que ainda depende de alguém, por tela">
        <Tabela
          colunas={[
            { titulo: "Tela", flex: 2 },
            { titulo: "Total", direita: true },
            { titulo: "Concluído", direita: true, cor: C.verde },
            { titulo: "Pendente", direita: true, cor: C.aviso },
            { titulo: "% concluído", direita: true },
          ]}
          linhas={[
            ["Novas Ações (desde " + na.desde + ")", na.total, na.concluidas, na.total - na.concluidas, pct(na.concluidas, na.total)],
            ["Sobreposições (locais)", so.total, so.ok + so.solucionado, so.pendente + so.problema, pct(so.ok + so.solucionado, so.total)],
            ["Termos (TEI e rescisão)", te.total, te.corrigido, te.pendente + te.problema, pct(te.corrigido, te.total)],
            [
              "Unidade/Quantidade (2023+)",
              d.unidadeVinculacao.unidadeFila + d.unidadeVinculacao.unidadeGravadas,
              d.unidadeVinculacao.unidadeGravadas,
              d.unidadeVinculacao.unidadeFila,
              pct(d.unidadeVinculacao.unidadeGravadas, d.unidadeVinculacao.unidadeFila + d.unidadeVinculacao.unidadeGravadas),
            ],
          ]}
        />
      </Cartao>
    </Pagina>
  );
}

function PaginaNovasAcoes({ d }: { d: DadosRelatorioPdf }) {
  const n = d.novasAcoes;
  return (
    <Pagina titulo="Novas Ações" subtitulo={`Checklist de KML, duplicação e documentos obrigatórios · ações criadas desde ${n.desde}`} geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Ações no escopo", valor: n.total, cor: C.azul },
          { rotulo: "Análises concluídas", valor: n.concluidas, cor: C.verde },
          { rotulo: "Em análise", valor: n.emAnalise, cor: C.amarelo },
          { rotulo: "Não iniciadas", valor: n.naoIniciadas, cor: C.neutro },
          { rotulo: "Item aguardando o órgão", valor: n.comPendenciaOrgao, cor: C.aviso },
          { rotulo: "Excluídas do SIMO, pendentes", valor: n.excluidasPendentes, cor: C.vermelho },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Situação das análises" sub="Todas as ações do escopo" flex={1} mr={8}>
          <Rosca
            itens={[
              { nome: "Concluídas", valor: n.concluidas, cor: C.verde },
              { nome: "Em análise", valor: n.emAnalise, cor: C.amarelo },
              { nome: "Não iniciadas", valor: n.naoIniciadas, cor: C.neutro },
            ]}
          />
        </Cartao>
        <Cartao titulo="Pendências por item do checklist" sub="Só ações ainda não concluídas" flex={1}>
          <Empilhadas
            segmentos={[
              { nome: "Confirmado", cor: C.verde },
              { nome: "Aguardando órgão", cor: C.aviso },
              { nome: "Não analisado", cor: C.grade },
            ]}
            linhas={n.itens.map((i) => ({ rotulo: i.nome, valores: [i.confirmado, i.aguardando, i.naoAnalisado] }))}
          />
        </Cartao>
      </View>
      <View style={s.linha}>
        <Cartao titulo="Órgãos com mais pendência de documentos" sub="Ações não concluídas sem documentos obrigatórios confirmados" flex={1} mr={8}>
          <BarrasH itens={n.porOrgao.filter((o) => o.pendDocs > 0).map((o) => ({ nome: o.orgao, valor: o.pendDocs }))} cor={C.aviso} vazio="Nenhuma pendência de documentos." />
        </Cartao>
        <Cartao titulo="Análises por pessoa" sub="Concluídas e pendentes, 1 por ação" flex={1}>
          <Empilhadas
            segmentos={[
              { nome: "Concluídas", cor: C.verde },
              { nome: "Pendentes", cor: C.aviso },
            ]}
            linhas={n.porPessoa.map((p) => ({ rotulo: p.nome, valores: [p.concluidas, p.pendentes] }))}
          />
        </Cartao>
      </View>
      <Cartao titulo="Detalhe por órgão" sub="Ações do escopo e o que falta em cada item (não concluídas)">
        <Tabela
          colunas={[
            { titulo: "Órgão", flex: 2 },
            { titulo: "Total", direita: true },
            { titulo: "Concluídas", direita: true, cor: C.verde },
            { titulo: "Sem KML ok", direita: true },
            { titulo: "Sem dupl. ok", direita: true },
            { titulo: "Sem docs ok", direita: true, cor: C.aviso },
          ]}
          linhas={n.porOrgao.map((o) => [o.orgao, o.total, o.concluidas, o.pendKml, o.pendDup, o.pendDocs])}
        />
      </Cartao>
    </Pagina>
  );
}

function PaginaSobreposicoes({ d }: { d: DadosRelatorioPdf }) {
  const o = d.sobreposicoes;
  return (
    <Pagina titulo="Sobreposições" subtitulo="Locais com trechos sobrepostos entre ações · decisão da equipe e observações" geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Locais importados", valor: o.total, cor: C.azul },
          { rotulo: "Aguardando revisão", valor: o.pendente, cor: C.neutro },
          { rotulo: "Sem problema", valor: o.ok, cor: C.verde },
          { rotulo: "Com problema", valor: o.problema, cor: C.aviso },
          { rotulo: "Solucionados", valor: o.solucionado, cor: C.violeta },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Situação dos locais" sub="Sem problema = não se configura como sobreposição" flex={1} mr={8}>
          <Rosca
            itens={[
              { nome: "Aguardando revisão", valor: o.pendente, cor: C.grade },
              { nome: "Sem problema", valor: o.ok, cor: C.verde },
              { nome: "Com problema", valor: o.problema, cor: C.amarelo },
              { nome: "Solucionado", valor: o.solucionado, cor: C.violeta },
            ]}
          />
        </Cartao>
        <Cartao titulo="Análises por pessoa" sub="Sem problema x com problema (inclui solucionados)" flex={1}>
          <Empilhadas
            segmentos={[
              { nome: "Sem problema", cor: C.verde },
              { nome: "Com problema", cor: C.amarelo },
            ]}
            linhas={o.porPessoa.map((p) => ({ rotulo: p.nome, valores: [p.ok, p.problema] }))}
          />
        </Cartao>
      </View>
      <View style={s.linha}>
        <Cartao titulo="Órgãos com mais locais com problema" sub="Locais com problema em aberto ou já solucionados" flex={1}>
          <Empilhadas
            segmentos={[
              { nome: "Em aberto", cor: C.amarelo },
              { nome: "Solucionado", cor: C.violeta },
            ]}
            linhas={o.porOrgao.map((x) => ({ rotulo: x.orgao, valores: [x.problema, x.solucionado] }))}
          />
        </Cartao>
      </View>
      <Cartao titulo="Últimas observações registradas" sub="Locais com problema ou solucionados, do mais recente ao mais antigo">
        <Tabela
          colunas={[
            { titulo: "Situação", flex: 1.1 },
            { titulo: "Ações", flex: 1.3 },
            { titulo: "Órgãos", flex: 1.2 },
            { titulo: "Responsável", flex: 1.4 },
            { titulo: "Observação", flex: 3.4 },
          ]}
          linhas={o.observacoes.map((x) => [x.status, x.ids, x.orgaos, x.responsavel, x.observacao])}
          vazio="Nenhuma observação registrada."
        />
      </Cartao>
    </Pagina>
  );
}

function PaginaTermos({ d }: { d: DadosRelatorioPdf }) {
  const t = d.termos;
  return (
    <Pagina titulo="Termos: Outros Documentos" subtitulo="Ações concluídas com Termo de Encerramento por Inatividade (TEI) ou Termo de Rescisão" geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Ações com termo", valor: t.total, cor: C.azul },
          { rotulo: "Aguardando conferência", valor: t.pendente, cor: C.neutro },
          { rotulo: "Corrigido", valor: t.corrigido, cor: C.verde },
          { rotulo: "Com problema", valor: t.problema, cor: C.aviso },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Situação da conferência" flex={1} mr={8}>
          <Rosca
            itens={[
              { nome: "Aguardando conferência", valor: t.pendente, cor: C.grade },
              { nome: "Corrigido", valor: t.corrigido, cor: C.verde },
              { nome: "Com problema", valor: t.problema, cor: C.amarelo },
            ]}
          />
        </Cartao>
        <Cartao titulo="Tipo de termo" flex={1}>
          <Rosca
            itens={[
              { nome: "TEI (inatividade)", valor: t.tei, cor: C.azul },
              { nome: "Rescisão", valor: t.rescisao, cor: C.laranja },
            ]}
          />
        </Cartao>
      </View>
      <Cartao titulo="Órgãos com mais termos por conferir" sub="Termos ainda não marcados como corrigidos">
        <Tabela
          colunas={[
            { titulo: "Órgão", flex: 3 },
            { titulo: "Total de termos", direita: true },
            { titulo: "Por conferir/corrigir", direita: true, cor: C.aviso },
          ]}
          linhas={t.porOrgao.map((o) => [o.orgao, o.total, o.pendentes])}
        />
      </Cartao>
    </Pagina>
  );
}

function PaginaUnidadeVinculacao({ d }: { d: DadosRelatorioPdf }) {
  const u = d.unidadeVinculacao;
  return (
    <Pagina titulo="Unidade/Quantidade e Vinculação SIAFE" subtitulo="Gravações feitas no SIMO a partir do painel" geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Sugestões na fila", valor: u.unidadeFila, cor: C.azul },
          { rotulo: "Aguardando aprovação", valor: u.unidadeAguardandoAprovacao, cor: C.neutro },
          { rotulo: "Aprovadas, a gravar", valor: u.unidadeAprovadas, cor: C.amarelo },
          { rotulo: "Gravadas no SIMO", valor: u.unidadeGravadas, cor: C.verde },
          { rotulo: "Falhas de gravação", valor: u.unidadeFalhas, cor: C.vermelho },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Unidade/Quantidade" sub="Situação das sugestões" flex={1} mr={8}>
          <Rosca
            itens={[
              { nome: "Aguardando aprovação", valor: u.unidadeAguardandoAprovacao, cor: C.grade },
              { nome: "Aprovadas, a gravar", valor: u.unidadeAprovadas, cor: C.amarelo },
              { nome: "Gravadas", valor: u.unidadeGravadas, cor: C.verde },
              { nome: "Com falha", valor: u.unidadeFalhas, cor: C.vermelho },
            ]}
          />
        </Cartao>
        <Cartao titulo="Vinculação SIAFE" sub={`${num(u.vincTentativas)} tentativas registradas`} flex={1}>
          <Rosca
            itens={[
              { nome: "Vinculadas com sucesso", valor: u.vincSucesso, cor: C.verde },
              { nome: "Com falha", valor: u.vincFalha, cor: C.vermelho },
            ]}
          />
        </Cartao>
      </View>
      <View style={s.linha}>
        <Cartao titulo="Unidade/Quantidade por pessoa" sub="Aprovações e gravações no SIMO" flex={1} mr={8}>
          <Tabela
            colunas={[{ titulo: "Pessoa", flex: 2.4 }, { titulo: "Aprovou", direita: true }, { titulo: "Gravou", direita: true, cor: C.verde }]}
            linhas={u.unidadePorPessoa.slice(0, 8).map((p) => [p.nome, p.aprovou, p.gravou])}
            vazio="Sem registros."
          />
        </Cartao>
        <Cartao titulo="Vinculação por pessoa" sub="Tentativas executadas" flex={1}>
          <Tabela
            colunas={[{ titulo: "Pessoa", flex: 2.4 }, { titulo: "Sucesso", direita: true, cor: C.verde }, { titulo: "Falha", direita: true, cor: C.vermelho }]}
            linhas={u.vincPorPessoa.slice(0, 8).map((p) => [p.nome, p.sucesso, p.falha])}
            vazio="Sem registros."
          />
        </Cartao>
      </View>
    </Pagina>
  );
}

const NOMES_MODULO: Record<string, string> = {
  novas_acoes: "Novas Ações",
  sobreposicoes: "Sobreposições",
  termos: "Termos",
  unidade_quantidade: "Unidade/Quantidade",
  vinculacao: "Vinculação",
};
const CORES_MODULO: Record<string, string> = {
  novas_acoes: C.azul,
  sobreposicoes: C.aqua,
  termos: C.amarelo,
  unidade_quantidade: C.laranja,
  vinculacao: C.violeta,
};

function PaginaEquipe({ d }: { d: DadosRelatorioPdf }) {
  const e = d.equipe;
  if (!e) return null;
  return (
    <Pagina titulo="Desempenho da equipe" subtitulo={`Histórico de análises · ${formatarDia(e.primeiroDia)} a ${formatarDia(e.ultimoDia)}`} geradoEm={d.geradoEm}>
      <Kpis
        itens={[
          { rotulo: "Análises feitas", valor: e.totalProdutivo, cor: C.azul },
          { rotulo: "Pessoas ativas", valor: e.pessoas, cor: C.verde },
          { rotulo: "Dias com atividade", valor: e.diasAtivos, cor: C.neutro },
          { rotulo: "Média por dia ativo", valor: String(e.mediaPorDiaAtivo).replace(".", ","), cor: C.violeta },
          { rotulo: "Falhas de gravação", valor: e.totalFalhas, cor: C.vermelho },
        ]}
      />
      <View style={s.linha}>
        <Cartao titulo="Divisão por tela" sub="Onde a equipe concentrou o trabalho" flex={1} mr={8}>
          <Rosca itens={e.porModulo.filter((m) => m.total > 0).map((m) => ({ nome: NOMES_MODULO[m.chave] ?? m.nome, valor: m.total, cor: CORES_MODULO[m.chave] ?? C.azul }))} />
        </Cartao>
        <Cartao titulo="Dia da semana" sub="Em quais dias a equipe mais produz" flex={1}>
          <Colunas itens={e.porDiaSemana.map((x) => ({ nome: x.dia, valor: x.total }))} />
        </Cartao>
      </View>
      <Cartao titulo="Detalhe por pessoa" sub="Ações/locais distintos analisados por pessoa e tela">
        <Tabela
          colunas={[
            { titulo: "Pessoa", flex: 2.6 },
            { titulo: "Novas Aç.", direita: true },
            { titulo: "Sobrep.", direita: true },
            { titulo: "Termos", direita: true },
            { titulo: "Unid/Qtd", direita: true },
            { titulo: "Vinc.", direita: true },
            { titulo: "Total", direita: true },
            { titulo: "Dias", direita: true },
            { titulo: "Última", flex: 1.3, direita: true },
          ]}
          linhas={e.porPessoa
            .filter((p) => p.total > 0)
            .map((p) => [
              p.nome,
              p.porModulo.novas_acoes ?? 0,
              p.porModulo.sobreposicoes ?? 0,
              p.porModulo.termos ?? 0,
              p.porModulo.unidade_quantidade ?? 0,
              p.porModulo.vinculacao ?? 0,
              p.total,
              p.diasAtivos,
              formatarDia(p.ultimoDia).slice(0, 5),
            ])}
        />
      </Cartao>
    </Pagina>
  );
}

export function RelatorioPdf({ dados, tipo }: { dados: DadosRelatorioPdf; tipo: TipoPdf }) {
  return (
    <Document title="Relatório: Monitoramento de Obras" author="Monitoramento de Obras">
      {tipo === "completo" && <PaginaGestao d={dados} />}
      {(tipo === "completo" || tipo === "novas_acoes") && <PaginaNovasAcoes d={dados} />}
      {(tipo === "completo" || tipo === "sobreposicoes") && <PaginaSobreposicoes d={dados} />}
      {(tipo === "completo" || tipo === "termos") && <PaginaTermos d={dados} />}
      {tipo === "completo" && <PaginaUnidadeVinculacao d={dados} />}
      {tipo === "completo" && dados.equipe && <PaginaEquipe d={dados} />}
    </Document>
  );
}

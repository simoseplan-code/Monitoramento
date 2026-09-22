// Leitura/gravação do formulário "Geral" de uma ação no SIMO — porta
// fiel da parte de scraping da planilha "Sugestão Unidade/Quantidade"
// (Apps Script), trocando UrlFetchApp por fetch. Usada só pra trocar
// Unidade de Medida / Quantidade (app/api/admin/aplicar-unidade) — não
// mexe em vinculação de contrato SIAFE, que é outro fluxo (lib/simo/sync.ts).
//
// Fragilidade conhecida e intencionalmente preservada (validada em
// produção pela planilha): o SIMO reenvia o formulário INTEIRO a cada
// gravação (não só a aba visível), fala Latin-1/Windows-1252 no corpo
// do POST (exceto o campo de unidade, que precisa vir em UTF-8), e tem
// blocos <template> escondidos no HTML que precisam ser removidos antes
// de serializar — senão os arrays de itens repetidos (pagamentos,
// localizações...) ficam desalinhados e o SIMO recusa a gravação.

const SIMO_INFORMATION_URL = "http://simo.pi.gov.br/cahier/action/projects/information/";
const SIMO_EDIT_URL = "http://simo.pi.gov.br/cahier/action/projects/edit/";
const SIMO_SHOW_ACTION_URL = "http://simo.pi.gov.br/cahier/action/projects/show/id/";

// Campos cujo VALOR precisa ir em UTF-8 padrão, não Latin-1 (confirmado
// testando ao vivo: "general[measure_unit]" com "M²" em Latin-1 salvava
// como "M" puro — o "²" sumia). O SIMO valida esse dropdown comparando
// contra o texto em UTF-8, diferente do resto do formulário.
const CAMPOS_VALOR_UTF8 = ["general[measure_unit]"];

export class SomenteLeituraError extends Error {
  constructor(id: string) {
    super(`Ação ${id} veio em modo SOMENTE LEITURA no SIMO (sem formulário editável).`);
    this.name = "SomenteLeituraError";
  }
}

function decodificarEntidadesHtml(s: string): string {
  const mapa: Record<string, string> = {
    "&amp;": "&", "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">",
    "&ccedil;": "ç", "&Ccedil;": "Ç", "&atilde;": "ã", "&Atilde;": "Ã",
    "&otilde;": "õ", "&Otilde;": "Õ", "&aacute;": "á", "&Aacute;": "Á",
    "&eacute;": "é", "&Eacute;": "É", "&iacute;": "í", "&Iacute;": "Í",
    "&oacute;": "ó", "&Oacute;": "Ó", "&uacute;": "ú", "&Uacute;": "Ú",
    "&ecirc;": "ê", "&Ecirc;": "Ê", "&acirc;": "â", "&Acirc;": "Â",
    "&ocirc;": "ô", "&Ocirc;": "Ô", "&uuml;": "ü", "&nbsp;": " ",
  };
  let out = s;
  Object.keys(mapa).forEach((k) => { out = out.split(k).join(mapa[k]); });
  return out.replace(/&#(\d+);/g, (_, cod) => String.fromCharCode(parseInt(cod, 10)));
}

// O HTML do formulário do SIMO tem blocos "template" — usados pelo JS
// deles pra clonar uma linha nova quando o usuário clica "+ adicionar".
// Ficam escondidos no HTML (CSS "dnone") com os MESMOS nomes de campo
// dos itens reais, só que com valores fictícios. Se não remover antes de
// ler, os arrays ficam desalinhados e o SIMO recusa a gravação (erro de
// SQL "no parameters were bound").
function removerTemplatesHtml(html: string): string {
  let out = html;
  out = out.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
  out = out.replace(/<!--\s*template\s*-->[\s\S]*?<!--\s*end template\s*-->/gi, "");
  out = out.replace(/<ul\b[^>]*\bclass="[^"]*\btemplate\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi, "");
  return out;
}

// O SIMO usa "-" como texto de "sem valor" em vários campos (datas
// principalmente) — isso está no HTML cru, mas o navegador limpa isso
// via JS antes de salvar de verdade. Reenviar o "-" literal quebra
// validação de data no backend.
function limparTraco(v: string): string {
  return v === "-" ? "" : v;
}

type Payload = Record<string, string | string[]>;

// Serializa TODOS os campos habilitados do formulário (igual o navegador
// faz de verdade ao clicar "Salvar" — o SIMO reenvia o formulário inteiro
// a cada gravação). Lê genericamente <input>/<select>/<textarea> com
// "name", pulando os desabilitados e os tipos que nunca são enviados
// como texto (submit/button/file/image/reset); checkbox/radio só se
// "checked".
function serializarFormularioSimo(html: string): Payload {
  const payload: Payload = {};
  const adicionar = (nome: string, valorBruto: string) => {
    const valor = limparTraco(valorBruto);
    if (Object.prototype.hasOwnProperty.call(payload, nome)) {
      const atual = payload[nome];
      payload[nome] = Array.isArray(atual) ? [...atual, valor] : [atual, valor];
    } else {
      payload[nome] = valor;
    }
  };
  const lerAttr = (attrs: string, nomeAttr: string): string | null => {
    const m = attrs.match(new RegExp(nomeAttr + '="([^"]*)"', "i"));
    return m ? m[1] : null;
  };

  const re = /<input\b([^>]*?)\/?>|<select\b([^>]*?)>([\s\S]*?)<\/select>|<textarea\b([^>]*?)>([\s\S]*?)<\/textarea>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      const attrs = m[1];
      if (/\bdisabled\b/i.test(attrs)) continue;
      const nome = lerAttr(attrs, "name");
      if (!nome) continue;
      const tipo = (lerAttr(attrs, "type") || "text").toLowerCase();
      if (["submit", "button", "file", "image", "reset"].includes(tipo)) continue;
      if ((tipo === "checkbox" || tipo === "radio") && !/\bchecked\b/i.test(attrs)) continue;
      const valor = lerAttr(attrs, "value");
      adicionar(nome, valor !== null ? decodificarEntidadesHtml(valor) : "");
    } else if (m[2] !== undefined) {
      const attrs = m[2], inner = m[3];
      if (/\bdisabled\b/i.test(attrs)) continue;
      const nome = lerAttr(attrs, "name");
      if (!nome) continue;
      const multiple = /\bmultiple\b/i.test(attrs);
      const optRe = /<option\b([^>]*?)>/gi;
      let om: RegExpExecArray | null;
      const selecionadas: string[] = [];
      while ((om = optRe.exec(inner)) !== null) {
        if (/\bselected\b/i.test(om[1])) {
          const v = lerAttr(om[1], "value");
          selecionadas.push(v !== null ? decodificarEntidadesHtml(v) : "");
        }
      }
      if (selecionadas.length === 0) {
        const primeira = /<option\b([^>]*?)>/i.exec(inner);
        if (primeira) {
          const v = lerAttr(primeira[1], "value");
          selecionadas.push(v !== null ? decodificarEntidadesHtml(v) : "");
        }
      }
      if (multiple) selecionadas.forEach((v) => adicionar(nome, v));
      else adicionar(nome, selecionadas.length ? selecionadas[0] : "");
    } else if (m[4] !== undefined) {
      const attrs = m[4], inner = m[5];
      if (/\bdisabled\b/i.test(attrs)) continue;
      const nome = lerAttr(attrs, "name");
      if (!nome) continue;
      adicionar(nome, decodificarEntidadesHtml(inner));
    }
  }
  return payload;
}

// Junta novos cookies (de um Set-Cookie de qualquer resposta) na string
// de cookie que já temos, sem duplicar a mesma chave (o mais novo vence).
function mesclarCookies(cookieBase: string, resp: Response): string {
  let novos = resp.headers.getSetCookie?.() ?? [];
  if (novos.length === 0) {
    const raw = resp.headers.get("set-cookie");
    if (raw) novos = [raw];
  }
  if (novos.length === 0) return cookieBase;
  const partes = novos.map((c) => c.split(";")[0]);
  const chavesNovas = new Set(partes.map((c) => c.split("=")[0]));
  const base = cookieBase.split("; ").filter((p) => p && !chavesNovas.has(p.split("=")[0]));
  return base.concat(partes).join("; ");
}

// Busca o formulário atual da ação no SIMO e monta o payload com o mesmo
// conjunto de campos que o SIMO reenvia ao clicar "Salvar" — só assim dá
// pra reenviar tudo igual, trocando apenas Unidade/Quantidade, sem risco
// de apagar outro campo da ação (datas, responsável, pagamentos...).
async function lerFormularioSimo(cookie: string, id: string): Promise<{ payload: Payload; cookie: string }> {
  // Visita a página "show" da ação primeiro, igual uma navegação normal
  // faria — sem isso, o SIMO às vezes devolve em "information/" uma
  // versão SOMENTE LEITURA do formulário, mesmo com permissão total.
  const respShow = await fetch(SIMO_SHOW_ACTION_URL + id, { headers: { Cookie: cookie } });
  cookie = mesclarCookies(cookie, respShow);

  const resp = await fetch(SIMO_INFORMATION_URL, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: SIMO_SHOW_ACTION_URL + id,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ id: String(id), edit: "true" }),
  });
  if (!resp.ok) throw new Error(`Falha ao ler o formulário da ação ${id} no SIMO (HTTP ${resp.status}).`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  const htmlBruto = new TextDecoder("iso-8859-1").decode(buffer);
  const html = removerTemplatesHtml(htmlBruto);

  if (html.indexOf('name="general[measure_unit]"') === -1) throw new SomenteLeituraError(id);

  return { payload: serializarFormularioSimo(html), cookie };
}

// Codifica UMA string em application/x-www-form-urlencoded usando Latin-1
// (ISO-8859-1) — todo acento do português cai dentro da faixa 0-255 do
// Latin-1, então cada caractere vira exatamente 1 byte (%XX), igual o
// SIMO espera. encodeURIComponent do JS gera UTF-8 (2+ bytes por acento)
// e corrompe o texto no backend deles.
function codificarLatin1(valor: string): string {
  let out = "";
  for (let i = 0; i < valor.length; i++) {
    const ch = valor.charAt(i);
    const code = valor.charCodeAt(i);
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else if (code <= 255) out += "%" + code.toString(16).toUpperCase().padStart(2, "0");
    else out += encodeURIComponent(ch);
  }
  return out;
}

// Monta o corpo completo application/x-www-form-urlencoded a partir do
// payload. Valores em Latin-1 por padrão, exceto os listados em
// CAMPOS_VALOR_UTF8 (ver comentário no topo do arquivo).
function payloadParaLatin1UrlEncoded(payload: Payload): string {
  const partes: string[] = [];
  Object.keys(payload).forEach((nome) => {
    const valores = Array.isArray(payload[nome]) ? (payload[nome] as string[]) : [payload[nome] as string];
    const usarUtf8 = CAMPOS_VALOR_UTF8.includes(nome);
    valores.forEach((v) => {
      const valorCodificado = usarUtf8 ? encodeURIComponent(v ?? "") : codificarLatin1(v ?? "");
      partes.push(codificarLatin1(nome) + "=" + valorCodificado);
    });
  });
  return partes.join("&");
}

export type ResultadoGravacao = { httpCode: number; texto: string };

// Grava a nova Unidade/Quantidade no SIMO: lê o estado atual completo da
// ação, troca só esses dois campos, reenvia tudo igual ao "Salvar" real.
// Renova a sessão e tenta uma vez a mais se a primeira leitura vier
// somente-leitura (pode ser a sessão tendo expirado no meio de um lote).
export async function salvarUnidadeQuantidade(
  cookieInicial: string,
  id: string,
  novaUnidade: string,
  novaQuantidade: string,
  unidadesValidas: string[],
  renovarLogin: () => Promise<string>
): Promise<ResultadoGravacao> {
  if (!unidadesValidas.includes(novaUnidade.trim())) {
    throw new Error(
      `Unidade "${novaUnidade}" não é uma opção válida do dropdown do SIMO (${unidadesValidas.join(", ")}).`
    );
  }

  let cookie = cookieInicial;
  let leitura: { payload: Payload; cookie: string };
  try {
    leitura = await lerFormularioSimo(cookie, id);
  } catch (e) {
    if (!(e instanceof SomenteLeituraError)) throw e;
    cookie = await renovarLogin();
    leitura = await lerFormularioSimo(cookie, id);
  }

  const payload = leitura.payload;
  cookie = leitura.cookie;
  payload["general[measure_unit]"] = novaUnidade;
  if (novaQuantidade !== "") payload["general[measure_quantity]"] = novaQuantidade;

  const resp = await fetch(SIMO_EDIT_URL, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: SIMO_SHOW_ACTION_URL + id,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: payloadParaLatin1UrlEncoded(payload),
  });

  const buffer = Buffer.from(await resp.arrayBuffer());
  const texto = new TextDecoder("iso-8859-1").decode(buffer);
  return { httpCode: resp.status, texto };
}

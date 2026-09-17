import { gunzipSync } from "node:zlib";

const SIMO_LOGIN_URL = "http://simo.pi.gov.br/cahier/authenticate/dologin";
const SIMO_REPORT_ID = "1740"; // Relatório "AUTOMAÇÃO CONTRATO SIAFE" (pasta A1 - TOM MUNIQUE)
const SIMO_SHOW_URL = `http://simo.pi.gov.br/cahier/action/projects/report/show/id/${SIMO_REPORT_ID}/`;
const SIMO_EXPORT_URL = `http://simo.pi.gov.br/cahier/action/projects/report/export-to-csv/id/${SIMO_REPORT_ID}`;

export async function loginSimo(): Promise<string> {
  const login = process.env.SIMO_LOGIN;
  const senha = process.env.SIMO_SENHA;
  if (!login || !senha) throw new Error("SIMO_LOGIN / SIMO_SENHA não configurados.");

  const resp = await fetch(SIMO_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ cahier_login: login, password: senha }),
    redirect: "manual",
  });

  let setCookie = resp.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) {
    const raw = resp.headers.get("set-cookie");
    if (raw) setCookie = [raw];
  }
  if (setCookie.length === 0) {
    throw new Error("Login no SIMO falhou (nenhum cookie de sessão retornado). Verifique SIMO_LOGIN/SIMO_SENHA.");
  }
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

export async function prepararRelatorioSimo(cookie: string): Promise<void> {
  const resp = await fetch(SIMO_SHOW_URL, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "http://simo.pi.gov.br/cahier/action/",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ id: SIMO_REPORT_ID }),
  });
  if (!resp.ok) throw new Error(`Falha ao preparar o relatório no SIMO (HTTP ${resp.status}).`);
}

export async function baixarCsvSimo(cookie: string): Promise<string> {
  const resp = await fetch(SIMO_EXPORT_URL, {
    headers: {
      Cookie: cookie,
      Referer: "http://simo.pi.gov.br/cahier/action/",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!resp.ok) throw new Error(`Falha ao baixar o relatório do SIMO (HTTP ${resp.status}).`);

  let buffer = Buffer.from(await resp.arrayBuffer());
  const ehGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  if (ehGzip) buffer = gunzipSync(buffer);

  // O SIMO exporta em Latin-1/Windows-1252, não UTF-8.
  const texto = new TextDecoder("iso-8859-1").decode(buffer);
  if (/<html/i.test(texto.slice(0, 200))) {
    throw new Error("O SIMO retornou uma página de login em vez do CSV — sessão expirada ou credenciais incorretas.");
  }
  return texto;
}

import { gunzipSync } from "node:zlib";

const SIMO_LOGIN_URL = "http://simo.pi.gov.br/cahier/authenticate/dologin";
const SIMO_REPORT_ID = "1740"; // Relatório "AUTOMAÇÃO CONTRATO SIAFE" (pasta A1 - TOM MUNIQUE)
const SIMO_SHOW_URL = `http://simo.pi.gov.br/cahier/action/projects/report/show/id/${SIMO_REPORT_ID}/`;
const SIMO_EXPORT_URL = `http://simo.pi.gov.br/cahier/action/projects/report/export-to-csv/id/${SIMO_REPORT_ID}`;

// fetch com limite de tempo e mensagem que diz QUAL etapa do SIMO demorou —
// sem isso, a rota era morta pelo servidor e o erro virava só "timeout".
async function buscar(etapa: string, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error(`${etapa}: o SIMO não respondeu em ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw e;
  }
}

export async function loginSimo(timeoutMs = 20_000): Promise<string> {
  const login = process.env.SIMO_LOGIN;
  const senha = process.env.SIMO_SENHA;
  if (!login || !senha) throw new Error("SIMO_LOGIN / SIMO_SENHA não configurados.");

  const resp = await buscar(
    "Login no SIMO",
    SIMO_LOGIN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ cahier_login: login, password: senha }),
      redirect: "manual",
    },
    timeoutMs
  );

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

export async function prepararRelatorioSimo(cookie: string, timeoutMs = 30_000): Promise<void> {
  const resp = await buscar(
    "Preparo do relatório no SIMO",
    SIMO_SHOW_URL,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "http://simo.pi.gov.br/cahier/action/",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ id: SIMO_REPORT_ID }),
    },
    timeoutMs
  );
  if (!resp.ok) throw new Error(`Falha ao preparar o relatório no SIMO (HTTP ${resp.status}).`);
}

export async function baixarCsvSimo(cookie: string, timeoutMs = 50_000): Promise<string> {
  const t0 = Date.now();
  const resp = await buscar(
    "Exportação do CSV no SIMO",
    SIMO_EXPORT_URL,
    {
      headers: {
        Cookie: cookie,
        Referer: "http://simo.pi.gov.br/cahier/action/",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
    timeoutMs
  );
  if (!resp.ok) throw new Error(`Falha ao baixar o relatório do SIMO (HTTP ${resp.status}).`);

  const tCabecalho = ((Date.now() - t0) / 1000).toFixed(1);

  // Lê o corpo aos pedaços, contando o que chegou: se estourar o tempo, a
  // mensagem diz quanto do arquivo já tinha vindo — isso mostra se o SIMO
  // está lento pra gerar ou pra enviar, e quão grande o relatório ficou.
  const pedacos: Uint8Array[] = [];
  let recebidos = 0;
  try {
    const leitor = resp.body!.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacos.push(value);
      recebidos += value.length;
    }
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error(
        `Exportação do CSV no SIMO: o SIMO respondeu ao pedido em ${tCabecalho}s, mas o arquivo não terminou de baixar em ${Math.round(timeoutMs / 1000)}s (chegaram ${Math.round(recebidos / 1024)} KB).`
      );
    }
    throw e;
  }
  let buffer = Buffer.concat(pedacos);
  const ehGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  if (ehGzip) buffer = gunzipSync(buffer);

  // O SIMO exporta em Latin-1/Windows-1252, não UTF-8.
  const texto = new TextDecoder("iso-8859-1").decode(buffer);
  if (/<html/i.test(texto.slice(0, 200))) {
    throw new Error("O SIMO retornou uma página de login em vez do CSV — sessão expirada ou credenciais incorretas.");
  }
  return texto;
}

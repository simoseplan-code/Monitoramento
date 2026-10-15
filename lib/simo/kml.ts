import { loginSimo } from "@/lib/simo/client";

const SIMO = "http://simo.pi.gov.br";
const LIMITE_BYTES = 50 * 1024 * 1024; // o SIMO aceita KML de até 50 MB

export class SemKmlError extends Error {
  constructor(idAcao: string) {
    super(`A ação ${idAcao} não tem KML anexado no SIMO (ou o SIMO não entregou o arquivo).`);
  }
}

/**
 * Baixa o KML anexado a uma ação (aba "Trechos" da edição). O endereço de download do SIMO é
 * /cahier/action-projects/download-kml/project_id/{id}; antes disso a ação é aberta na sessão,
 * como uma navegação normal faria.
 */
export async function baixarKmlDaAcao(idAcao: string): Promise<{ buffer: Buffer; nome: string }> {
  if (!/^\d{1,12}$/.test(idAcao)) throw new Error("ID de ação inválido.");

  let cookie = await loginSimo();
  const abertura = await fetch(`${SIMO}/cahier/action/projects/show/id/${idAcao}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const novos = abertura.headers.getSetCookie?.() ?? [];
  if (novos.length) cookie = [cookie, ...novos.map((c) => c.split(";")[0])].join("; ");
  await abertura.arrayBuffer();

  const resp = await fetch(`${SIMO}/cahier/action-projects/download-kml/project_id/${idAcao}`, {
    headers: { Cookie: cookie, Referer: `${SIMO}/cahier/action/projects/show/id/${idAcao}` },
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  if (resp.status >= 300 && resp.status < 400) throw new SemKmlError(idAcao);
  if (!resp.ok) throw new Error(`O SIMO respondeu HTTP ${resp.status} ao baixar o KML da ação ${idAcao}.`);

  const declarado = Number(resp.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_BYTES) throw new Error("O KML dessa ação passa de 50 MB.");
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length === 0 || buffer.length > LIMITE_BYTES) throw new SemKmlError(idAcao);

  // Tem que ser KML (texto com <kml>) ou KMZ (zip): uma página HTML ou JSON de erro não serve.
  const inicio = buffer.subarray(0, 4000).toString("utf8");
  const ehZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!ehZip && !/<kml[\s>]/i.test(inicio)) throw new SemKmlError(idAcao);

  const disposicao = resp.headers.get("content-disposition") ?? "";
  const doCabecalho = disposicao.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const nome = decodeURIComponent(doCabecalho ?? `${idAcao}.${ehZip ? "kmz" : "kml"}`).slice(0, 200);
  return { buffer, nome };
}

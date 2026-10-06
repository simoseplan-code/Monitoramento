/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Geradores de PDF/Excel rodam só no servidor e não devem ser empacotados.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // O pdfkit carrega as fontes padrão (Helvetica etc.) por import dinâmico
  // ("#standard-fonts/..."), que o rastreamento da Vercel não enxerga: sem isto
  // a função em produção falha com "Cannot find module .../Helvetica.cjs".
  outputFileTracingIncludes: {
    "/api/relatorios/pdf": [
      "./node_modules/pdfkit/**/*",
      "./node_modules/@react-pdf/**/*",
      "./node_modules/fontkit/**/*",
      "./node_modules/hyphen/**/*",
    ],
    "/api/relatorios/pendencias": [
      "./node_modules/pdfkit/**/*",
      "./node_modules/@react-pdf/**/*",
      "./node_modules/fontkit/**/*",
      "./node_modules/hyphen/**/*",
    ],
  },
};

export default nextConfig;

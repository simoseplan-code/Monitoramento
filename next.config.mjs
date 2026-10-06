const emProducao = process.env.NODE_ENV === "production";

// O painel só carrega recursos do próprio site, do Cloudflare (checkbox Turnstile) e do
// Supabase. Em desenvolvimento o Next precisa de eval/websocket para recarregar a página,
// então a política só é aplicada em produção.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const cabecalhosDeSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ...(emProducao ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
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

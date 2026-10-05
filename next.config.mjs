/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Geradores de PDF/Excel rodam só no servidor e não devem ser empacotados.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
};

export default nextConfig;

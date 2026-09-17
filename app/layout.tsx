import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitoramento de Obras",
  description: "Painel interno de acompanhamento de obras e vinculação SIAFE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  nome,
  cargo,
  isAdmin,
  counts,
  titulo,
  subtitulo,
  notificacoesCount = 0,
  children,
}: {
  nome: string;
  cargo?: string | null;
  isAdmin: boolean;
  counts: { acoes: number; pendentesAprovacao: number; novasAcoesPendentes: number; sobreposicoesPendentes?: number };
  titulo: string;
  subtitulo?: string;
  notificacoesCount?: number;
  children: React.ReactNode;
}) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen bg-plane">
      <Sidebar nome={nome} cargo={cargo} isAdmin={isAdmin} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={titulo} subtitulo={subtitulo} iniciais={iniciais} notificacoesCount={notificacoesCount} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

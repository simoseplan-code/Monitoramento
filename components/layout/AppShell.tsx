import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export async function AppShell({
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
  counts: {
    acoes: number;
    pendentesAprovacao: number;
    novasAcoesPendentes: number;
    sobreposicoesPendentes?: number;
    sugestoesUnidadePendentes?: number;
    vinculacaoPendentes?: number;
    termosPendentes?: number;
    novasExecucaoPendentes?: number;
  };
  titulo: string;
  subtitulo?: string;
  notificacoesCount?: number;
  children: React.ReactNode;
}) {
  // O número de Novas em Execução aparece em todas as telas (não depende de cada página calcular).
  let novasExecucaoPendentes = counts.novasExecucaoPendentes;
  if (novasExecucaoPendentes === undefined) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.rpc("contar_novas_execucao_pendentes");
      novasExecucaoPendentes = Number(data ?? 0);
    } catch {
      novasExecucaoPendentes = 0;
    }
  }

  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen bg-plane">
      <Sidebar nome={nome} cargo={cargo} isAdmin={isAdmin} counts={{ ...counts, novasExecucaoPendentes }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={titulo} subtitulo={subtitulo} iniciais={iniciais} notificacoesCount={notificacoesCount} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

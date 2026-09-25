import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Paginacao } from "@/components/Paginacao";
import { contarNovasAcoesPendentes } from "@/lib/novasAcoes";
import { contarTermosPendentes } from "@/lib/termos";
import { CardTermo } from "./CardTermo";
import { FiltrosTermos } from "./FiltrosTermos";

const PAGE_SIZE = 50;
const ROTULO_STATUS = { pendente: "aguardando conferência", corrigido: "corrigidas", problema: "com problema" } as const;

type LinhaTermo = {
  id_acao: string;
  nome_acao: string;
  orgao: string | null;
  data_criacao: string | null;
  data_receb_definitivo: string | null;
  data_receb_provisorio: string | null;
  tipo_documento: string;
  numero_automatico: string | null;
  status_revisao: "pendente" | "corrigido" | "problema";
  observacao: string | null;
  total_geral: number;
};

const dataValida = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function TermosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tipo?: string; orgao?: string; de?: string; ate?: string; busca?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "corrigido" || sp.status === "problema" ? sp.status : "pendente";
  const tipo = sp.tipo === "tei" || sp.tipo === "rescisao" ? sp.tipo : "";
  const orgao = sp.orgao ?? "";
  const de = dataValida(sp.de);
  const ate = dataValida(sp.ate);
  const busca = sp.busca ?? "";
  const paginaAtual = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const filtrosComuns = {
    tipo_filtro: tipo || null,
    orgao_filtro: orgao || null,
    data_de: de || null,
    data_ate: ate || null,
    busca: busca || null,
  };

  const [
    { data: profile },
    { count: totalAcoes },
    { count: pendentesAprovacao },
    novasAcoesPendentes,
    termosPendentes,
    { data: linhasRpc },
    { data: contagensRpc },
    { data: orgaosRpc },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cargo, is_admin").eq("id", user!.id).single(),
    supabase.from("obras").select("id_acao", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    contarNovasAcoesPendentes(supabase),
    contarTermosPendentes(supabase),
    supabase.rpc("termos_lista", { ...filtrosComuns, filtro_status: status, pagina: paginaAtual, tamanho: PAGE_SIZE }),
    supabase.rpc("termos_contagens", filtrosComuns),
    supabase.rpc("termos_orgaos"),
  ]);

  const linhas = (linhasRpc ?? []) as LinhaTermo[];
  const totalGeral = linhas[0]?.total_geral ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalGeral / PAGE_SIZE));
  const c = (contagensRpc?.[0] ?? {}) as { pendente?: number; corrigido?: number; problema?: number };
  const contagens = { pendente: Number(c.pendente ?? 0), corrigido: Number(c.corrigido ?? 0), problema: Number(c.problema ?? 0) };
  const orgaos = (orgaosRpc ?? []).map((r: { orgao: string }) => r.orgao);

  return (
    <AppShell
      nome={profile?.nome ?? "Usuário"}
      cargo={profile?.cargo}
      isAdmin={!!profile?.is_admin}
      counts={{
        acoes: totalAcoes ?? 0,
        pendentesAprovacao: pendentesAprovacao ?? 0,
        novasAcoesPendentes,
        termosPendentes,
      }}
      titulo="Termos — Outros Documentos"
      subtitulo={`${totalGeral} ação(ões) concluída(s) com TEI ou Rescisão — ${ROTULO_STATUS[status]}`}
    >
      <div className="mb-4">
        <FiltrosTermos atuais={{ status, tipo, orgao, de, ate, busca }} contagens={contagens} orgaos={orgaos} />
      </div>

      <div className="space-y-3">
        {linhas.map((l) => (
          <CardTermo
            key={l.id_acao}
            idAcao={l.id_acao}
            nomeAcao={l.nome_acao}
            orgao={l.orgao}
            dataCriacao={l.data_criacao}
            recebDefinitivo={l.data_receb_definitivo}
            recebProvisorio={l.data_receb_provisorio}
            tipoDocumento={l.tipo_documento}
            numeroAutomatico={l.numero_automatico}
            statusInicial={l.status_revisao}
            observacaoInicial={l.observacao}
          />
        ))}

        {linhas.length === 0 && (
          <div className="rounded-xl border border-black/5 bg-surface p-10 text-center shadow-card">
            <p className="text-sm text-ink-muted">
              {status === "pendente" ? "Nenhuma ação aguardando conferência. 🎉" : "Nenhuma ação nesta lista ainda."}
            </p>
          </div>
        )}

        <Paginacao
          paginaAtual={paginaAtual}
          totalPaginas={totalPaginas}
          baseHref="/termos"
          params={{ status: status !== "pendente" ? status : undefined, tipo, orgao, de, ate, busca }}
        />
      </div>
    </AppShell>
  );
}

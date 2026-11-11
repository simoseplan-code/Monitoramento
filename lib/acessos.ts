// Quem acessa o quê no painel, por função. É a fonte da planilha "acessos por usuário" (Equipe) e segue as regras
// que o código aplica hoje: middleware.ts (telas só de admin e chefe), menu (Sidebar), APIs e a função DIGEPI.
//
// Funções: admin, chefe, equipe, digepi. "Sem acesso" = cadastro pendente ou rejeitado.

export type Funcao = "admin" | "chefe" | "equipe" | "digepi";

export const ROTULO_FUNCAO: Record<string, string> = { admin: "Administrador", chefe: "Chefe", equipe: "Equipe", digepi: "DIGEPI" };

type Regra = (f: Funcao) => boolean;
const todosAprovados: Regra = (f) => f === "admin" || f === "chefe" || f === "equipe";
const supervisores: Regra = (f) => f === "admin" || f === "chefe";
const soAdmin: Regra = (f) => f === "admin";

/** Telas do painel e quem entra em cada uma. */
export const TELAS_E_ACESSOS: { grupo: string; tela: string; regra: Regra }[] = [
  { grupo: "Gestão", tela: "Dashboard Gestão", regra: todosAprovados },
  { grupo: "Gestão", tela: "Ações", regra: todosAprovados },
  { grupo: "Gestão", tela: "Órgãos", regra: todosAprovados },
  { grupo: "Gestão", tela: "Histórico", regra: todosAprovados },
  { grupo: "Gestão", tela: "Desempenho", regra: supervisores },
  { grupo: "Gestão", tela: "Equipe (ver a lista)", regra: supervisores },
  { grupo: "Gestão", tela: "Administração", regra: supervisores },
  { grupo: "Gestão", tela: "Análise de obras concluídas", regra: supervisores },
  { grupo: "Retiradas", tela: "Ações desconsideradas", regra: todosAprovados },
  { grupo: "Verificações diárias", tela: "Novas Ações", regra: todosAprovados },
  { grupo: "Verificações diárias", tela: "Novas em Execução", regra: todosAprovados },
  { grupo: "Verificações diárias", tela: "Termos (Outros Docs)", regra: todosAprovados },
  { grupo: "Verificações diárias", tela: "Unidade/Quantidade", regra: todosAprovados },
  { grupo: "Verificações diárias", tela: "Análise geral", regra: todosAprovados },
  { grupo: "Verificação SIAFE", tela: "SIAFE duplicado", regra: todosAprovados },
  { grupo: "Verificação SIAFE", tela: "Não vinculadas SIAFE", regra: todosAprovados },
  { grupo: "Verificação SIAFE", tela: "Vinculação SIAFE", regra: todosAprovados },
  { grupo: "Verificação SIAFE", tela: "Configuração de TD", regra: todosAprovados },
  { grupo: "Georreferenciamento", tela: "Buscador de KML SIMO", regra: todosAprovados },
  { grupo: "Georreferenciamento", tela: "Sobreposições", regra: supervisores },
  { grupo: "Georreferenciamento", tela: "Verificação de bairros", regra: todosAprovados },
  { grupo: "Georreferenciamento", tela: "Mapa geral", regra: supervisores },
  { grupo: "Georreferenciamento", tela: "Mapa de Recursos Hídricos", regra: (f) => todosAprovados(f) || f === "digepi" },
  { grupo: "Medições", tela: "Compatibilização de medições", regra: todosAprovados },
];

/** Ações e limites que não são uma tela. */
export const PERMISSOES: { permissao: string; regra: Regra }[] = [
  { permissao: "Vê todas as tipologias de obra (DIGEPI vê só recursos hídricos)", regra: todosAprovados },
  { permissao: "Aprovar cadastros, mudar a função e resetar a senha de alguém", regra: soAdmin },
  { permissao: "Sincronizar com o SIMO e vincular ao SIAFE no SIMO", regra: supervisores },
  { permissao: "Conferir/baixar KML no SIMO (um a um e em lote)", regra: supervisores },
  { permissao: "Ler os boletins de medição no SIMO (Compatibilização de medições)", regra: supervisores },
  { permissao: "Atualizar a localização (bairros e territórios)", regra: supervisores },
  { permissao: "Gravar o filtro da Análise de obras concluídas (vale para todos)", regra: supervisores },
  { permissao: "Gravar filtros das demais telas (vale para todos)", regra: todosAprovados },
  { permissao: "Exportar Excel, PDF e KML do mapa de Recursos Hídricos", regra: (f) => todosAprovados(f) || f === "digepi" },
];

/** A função de quem tem acesso; cadastro pendente, rejeitado ou desconhecido não tem. */
export function funcaoEfetiva(papel: string | null | undefined, status: string | null | undefined): Funcao | null {
  if (status === "digepi") return "digepi";
  if (status !== "aprovado") return null;
  return papel === "admin" || papel === "chefe" || papel === "equipe" ? papel : "equipe";
}

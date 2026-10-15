// Itens conferidos na análise de "Novas em Execução". Para trocar ou acrescentar um item
// basta mexer nesta lista: o banco guarda os itens por chave, sem precisar de migration.
export const ITENS_EXECUCAO = [
  { campo: "kml_anexado", label: "KML anexado" },
  // A chave interna continua "documentos_obrigatorios" para não perder o que já foi marcado; só o nome mudou.
  { campo: "documentos_obrigatorios", label: "Vinculação com SIAFE" },
  { campo: "emissao_os", label: "Emissão da O.S." },
  { campo: "cronograma", label: "Cronograma Fis/Fin" },
] as const;

export type CampoExecucao = (typeof ITENS_EXECUCAO)[number]["campo"];
export type StatusItem = "pendente" | "confirmado" | "aguardando_atualizacao";

export const CAMPOS_EXECUCAO: string[] = ITENS_EXECUCAO.map((i) => i.campo);
export const STATUS_ITEM: StatusItem[] = ["pendente", "confirmado", "aguardando_atualizacao"];

export const ALVO_EXECUCAO = { tabela: "obras_exec_revisao", coluna: "id_acao" };

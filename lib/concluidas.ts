// Itens conferidos na análise de "Novas Concluídas" (ações que entraram no status Concluído). Para trocar ou
// acrescentar um item basta mexer nesta lista: o banco guarda os itens por chave, sem precisar de migration.
export const ITENS_CONCLUIDAS = [
  { campo: "kml_anexado", label: "KML" },
  { campo: "termo_recebimento", label: "Termo de recebimento" },
] as const;

export type CampoConcluidas = (typeof ITENS_CONCLUIDAS)[number]["campo"];
export type StatusItem = "pendente" | "confirmado" | "aguardando_atualizacao";

export const CAMPOS_CONCLUIDAS: string[] = ITENS_CONCLUIDAS.map((i) => i.campo);
export const STATUS_ITEM: StatusItem[] = ["pendente", "confirmado", "aguardando_atualizacao"];

export const ALVO_CONCLUIDAS = { tabela: "obras_concl_revisao", coluna: "id_acao" };

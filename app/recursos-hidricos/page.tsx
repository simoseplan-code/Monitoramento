import { PaginaTerritorio } from "@/app/analise-territorio/PaginaTerritorio";

// Mapa de Recursos Hídricos: igual ao Mapa geral, só com as tipologias de recursos hídricos. Única tela da função DIGEPI.
export default async function RecursosHidricosPage() {
  return <PaginaTerritorio modo="hidricos" />;
}

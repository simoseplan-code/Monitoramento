// Endereço da ação no SIMO. Abre em nova aba: quem já está logado no
// SIMO cai direto na ação, sem passar por busca.
export function urlAcaoSimo(id: string): string {
  return `http://simo.pi.gov.br/cahier/action/projects/show/id/${encodeURIComponent(id)}`;
}

export function IdAcaoLink({ id, children }: { id: string; children?: React.ReactNode }) {
  return (
    <a
      href={urlAcaoSimo(id)}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir a ação no SIMO"
      className="text-series-1 hover:underline"
    >
      {children ?? id}
    </a>
  );
}

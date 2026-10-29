// As listas de IDs desconsiderados (uma por análise, mais a "todas"). Arquivo sem acesso ao servidor:
// pode ser usado também nas telas (navegador).

export const TELAS_DESCONSIDERADAS = [
  { chave: "todas", rotulo: "Todas as análises", restrita: true, ajuda: "Os IDs daqui saem de TODAS as análises abaixo." },
  { chave: "nao_vinculadas", rotulo: "Não vinculadas SIAFE", restrita: false, ajuda: "Saem só da aba Não vinculadas SIAFE." },
  { chave: "concluidas", rotulo: "Obras concluídas", restrita: true, ajuda: "Saem só da Análise de obras concluídas." },
  { chave: "siafe_duplicado", rotulo: "SIAFE duplicado", restrita: false, ajuda: "Saem só da lista de SIAFE duplicado." },
  { chave: "bairros", rotulo: "Verificação de bairros", restrita: false, ajuda: "Saem só da Verificação de bairros." },
] as const;

export type ChaveTela = (typeof TELAS_DESCONSIDERADAS)[number]["chave"];

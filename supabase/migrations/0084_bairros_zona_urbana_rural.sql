-- Verificação de bairros: zona urbana / rural de cada ação (setor censitário do IBGE, Censo 2022).
-- Guarda quanto do trecho (metros) e quantos pontos caem em setor urbano e em setor rural.
-- Depois deste SQL, clique em "Refazer tudo" na tela para calcular a zona de todas as ações.

alter table public.acao_bairros_calculo
  add column if not exists metros_urbano double precision not null default 0,
  add column if not exists metros_rural double precision not null default 0,
  add column if not exists pontos_urbano integer not null default 0,
  add column if not exists pontos_rural integer not null default 0;

-- Colunas novas no fim da lista (é o que o "create or replace" aceita).
create or replace view public.acao_bairros_lista
with (security_invoker = true) as
select
  c.id_acao,
  c.fonte,
  c.extensao_m,
  c.metros_fora,
  c.calculado_em,
  b.municipio,
  b.bairro,
  b.metros,
  b.pct,
  o.nome_acao,
  o.orgao,
  o.status,
  o.estagio_atual,
  b.pontos,
  c.pontos_fora,
  c.metros_urbano,
  c.metros_rural,
  c.pontos_urbano,
  c.pontos_rural
from public.acao_bairros_calculo c
join public.obras o on o.id_acao = c.id_acao
left join public.acao_bairros b on b.id_acao = c.id_acao;

grant select on public.acao_bairros_lista to authenticated;

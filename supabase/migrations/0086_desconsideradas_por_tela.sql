-- A lista de IDs desconsiderados passa a ser uma por análise (tela): "nao_vinculadas" (a que já existia)
-- e "concluidas" (Análise de obras concluídas). Quem já estava na lista continua em "nao_vinculadas".

alter table public.acoes_desconsideradas
  add column if not exists tela text not null default 'nao_vinculadas';

alter table public.acoes_desconsideradas drop constraint if exists acoes_desconsideradas_pkey;
alter table public.acoes_desconsideradas add primary key (tela, id_acao);

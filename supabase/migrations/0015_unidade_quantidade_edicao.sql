-- Ajustes na tela Unidade/Quantidade a partir do feedback de uso real:
-- 1) equipe precisa poder EDITAR unidade/quantidade antes de aprovar
--    (não só aceitar a sugestão do motor);
-- 2) itens aprovados (mas ainda não gravados no SIMO) devem continuar
--    visíveis por padrão — só os já aplicados somem da lista padrão;
-- 3) contador de "aprovadas aguardando gravação" pra botão de aplicar
--    aparecer também na própria tela (não só em /admin).

alter table public.obras_unidade_sugestao
  add column unidade_final text,
  add column quantidade_final text;

create or replace function public.contar_sugestoes_unidade_aprovadas()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_unidade_sugestao
  where aprovado = true and aplicado_em is null;
$$;

-- Troca so_pendentes_aprovacao (escondia tudo que já tinha sido
-- aprovado) por mostrar_aplicadas (só esconde o que já foi gravado no
-- SIMO — aprovado-mas-não-aplicado continua na lista, já que o trabalho
-- ainda não terminou) e devolve unidade_final/quantidade_final.
create or replace function public.unidade_sugestao_lista(
  busca text default null,
  orgao_filtro text default null,
  confianca_filtro text default null,
  mostrar_aplicadas boolean default false,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  tipologia text,
  unidade_atual text,
  quantidade_atual text,
  unidade_sugerida text,
  quantidade_sugerida text,
  sem_quantidade boolean,
  unidade_final text,
  quantidade_final text,
  confianca text,
  aviso_tipologia boolean,
  motivo text,
  aprovado boolean,
  aplicado_em timestamptz,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.tipologia,
      s.unidade_atual,
      s.quantidade_atual,
      s.unidade_sugerida,
      s.quantidade_sugerida,
      s.sem_quantidade,
      s.unidade_final,
      s.quantidade_final,
      s.confianca,
      s.aviso_tipologia,
      s.motivo,
      s.aprovado,
      s.aplicado_em
    from public.obras_unidade_sugestao s
    join public.obras o on o.id_acao = s.id_acao
    where (mostrar_aplicadas or s.aplicado_em is null)
      and (confianca_filtro is null or confianca_filtro = '' or s.confianca = confianca_filtro)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select base.*, count(*) over() as total_geral
  from base
  order by
    case when aplicado_em is not null then 2 when aprovado then 1 else 0 end,
    id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

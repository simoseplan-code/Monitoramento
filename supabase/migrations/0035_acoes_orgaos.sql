-- Lista de órgãos distintos entre todas as obras, pra popular o filtro
-- por órgão na tela de Ações.
create or replace function public.acoes_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(o.orgao) as orgao
  from public.obras o
  where trim(coalesce(o.orgao, '')) <> ''
  order by 1;
$$;

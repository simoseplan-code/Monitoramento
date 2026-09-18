-- Lista de órgãos distintos entre TODAS as obras que aparecem em
-- qualquer sobreposição — usada pra popular o filtro por órgão.
create or replace function public.sobreposicoes_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(obra.value ->> 'orgao') as orgao
  from public.sobreposicoes s
  cross join lateral jsonb_array_elements(s.obras) as obra
  where trim(obra.value ->> 'orgao') is not null and trim(obra.value ->> 'orgao') <> ''
  order by 1;
$$;

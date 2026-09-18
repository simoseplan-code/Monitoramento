-- Substitui as 4 chamadas separadas de obras_top_orgaos (uma por
-- status) por uma única consulta que já devolve os 3 primeiros órgãos
-- de cada balde de uma vez — 4 idas ao banco viram 1 no dashboard.
--
-- Importante: "dado_incorreto" NÃO é excludente dos outros — uma ação
-- vinculada também pode ter o número do SIAFE mal formatado — por isso
-- os 4 baldes são somados de forma independente (union all), igual o
-- obras_top_orgaos original fazia balde por balde.
create or replace function public.obras_top_orgaos_todos(limite int default 3)
returns table (bucket text, orgao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  with linhas as (
    select
      orgao,
      (numero_automatico is not null) as eh_vinculada,
      (numero_automatico is null and numero_siafe is not null) as eh_pendente,
      (numero_automatico is null and numero_siafe is null) as eh_sem_numero,
      (numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as eh_dado_incorreto
    from public.obras
    where orgao is not null
  ),
  contagens as (
    select 'vinculada' as bucket, orgao, count(*) as total from linhas where eh_vinculada group by orgao
    union all
    select 'pendente', orgao, count(*) from linhas where eh_pendente group by orgao
    union all
    select 'sem_numero', orgao, count(*) from linhas where eh_sem_numero group by orgao
    union all
    select 'dado_incorreto', orgao, count(*) from linhas where eh_dado_incorreto group by orgao
  ),
  ranqueado as (
    select bucket, orgao, total, row_number() over (partition by bucket order by total desc) as posicao
    from contagens
  )
  select bucket, orgao, total
  from ranqueado
  where posicao <= limite
  order by bucket, posicao;
$$;

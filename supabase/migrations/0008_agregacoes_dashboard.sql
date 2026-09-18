-- Resumo do dashboard num único round-trip, em vez de trazer as 13k+
-- linhas de "obras" pro Next.js só pra somar em JavaScript.
create or replace function public.obras_resumo()
returns table (
  total bigint,
  vinculadas bigint,
  pendentes bigint,
  sem_numero bigint,
  dado_incorreto bigint,
  orgaos_distintos bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) as total,
    count(*) filter (where numero_automatico is not null) as vinculadas,
    count(*) filter (where numero_automatico is null and numero_siafe is not null) as pendentes,
    count(*) filter (where numero_automatico is null and numero_siafe is null) as sem_numero,
    count(*) filter (where numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as dado_incorreto,
    count(distinct orgao) as orgaos_distintos
  from public.obras;
$$;

-- Top órgãos de cada "balde" (usado nas colunas de status do dashboard)
-- — já agrupado e ordenado no banco, só os 3 primeiros trafegam.
create or replace function public.obras_top_orgaos(bucket text, limite int default 3)
returns table (orgao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  select orgao, count(*) as total
  from public.obras
  where orgao is not null
    and case bucket
      when 'sem_numero' then numero_automatico is null and numero_siafe is null
      when 'pendente' then numero_automatico is null and numero_siafe is not null
      when 'dado_incorreto' then numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$'
      when 'vinculada' then numero_automatico is not null
      else false
    end
  group by orgao
  order by total desc
  limit limite;
$$;

-- Página "Órgãos": agrupamento pronto do banco em vez de somar 13k
-- linhas em memória no servidor Next.js.
create or replace function public.obras_por_orgao()
returns table (orgao text, total bigint, vinculadas bigint, pendentes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(orgao, 'Sem órgão informado') as orgao,
    count(*) as total,
    count(*) filter (where numero_automatico is not null) as vinculadas,
    count(*) filter (where numero_automatico is null and numero_siafe is not null) as pendentes
  from public.obras
  group by coalesce(orgao, 'Sem órgão informado')
  order by total desc;
$$;

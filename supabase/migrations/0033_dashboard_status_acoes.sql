-- "Status das ações" do Dashboard: o status da ação no SIMO (Em
-- desenvolvimento, Concluído, Cancelado...), só das criadas a partir da
-- data de corte (2023). Traz também os órgãos com mais ações em cada status.
create or replace function public.dashboard_status_acoes(
  data_corte date default '2023-01-01',
  limite int default 3
)
returns table (status text, total bigint, top_orgaos text[])
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select coalesce(nullif(trim(o.status), ''), 'Sem status') as status, o.orgao
    from public.obras o
    where o.data_criacao >= data_corte
  ),
  por_status as (
    select b.status, count(*) as total from base b group by b.status
  ),
  por_orgao as (
    select
      b.status,
      b.orgao,
      row_number() over (partition by b.status order by count(*) desc, b.orgao) as rn
    from base b
    where b.orgao is not null
    group by b.status, b.orgao
  )
  select
    p.status,
    p.total,
    coalesce((select array_agg(po.orgao order by po.rn) from por_orgao po where po.status = p.status and po.rn <= limite), '{}')
  from por_status p
  order by p.total desc;
$$;

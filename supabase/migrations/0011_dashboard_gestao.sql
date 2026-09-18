-- Resumo do "Dashboard Gestão": separa o que foi criado antes de 2023
-- (só um número informativo, fora dos indicadores) do que foi criado
-- de 2023 pra cá (esse sim entra na análise de status).
create or replace function public.dashboard_gestao_resumo(data_corte date default '2023-01-01')
returns table (
  antes_corte bigint,
  sem_data bigint,
  apos_corte_total bigint,
  apos_corte_vinculadas bigint,
  apos_corte_pendentes bigint,
  apos_corte_sem_numero bigint,
  apos_corte_dado_incorreto bigint,
  apos_corte_orgaos_distintos bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where data_criacao is not null and data_criacao < data_corte) as antes_corte,
    count(*) filter (where data_criacao is null) as sem_data,
    count(*) filter (where data_criacao >= data_corte) as apos_corte_total,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is not null) as apos_corte_vinculadas,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is null and numero_siafe is not null) as apos_corte_pendentes,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is null and numero_siafe is null) as apos_corte_sem_numero,
    count(*) filter (where data_criacao >= data_corte and numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as apos_corte_dado_incorreto,
    count(distinct orgao) filter (where data_criacao >= data_corte) as apos_corte_orgaos_distintos
  from public.obras;
$$;

-- Mesmo "top 3 órgãos por balde" de antes, mas só considerando ações
-- criadas a partir do corte (2023 por padrão).
create or replace function public.dashboard_gestao_top_orgaos(data_corte date default '2023-01-01', limite int default 3)
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
    where orgao is not null and data_criacao >= data_corte
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

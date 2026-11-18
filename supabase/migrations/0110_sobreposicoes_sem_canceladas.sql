-- Filtro "Tirar TODAS as canceladas da análise": esconde qualquer par em que PELO MENOS UMA das obras esteja com status Cancelado.

drop function if exists public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int, text, boolean);
drop function if exists public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text, boolean);
drop function if exists public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text, text, boolean);

create or replace function public.sobreposicoes_pares_lista(
  filtro_status text default 'pendente',
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  grupo_situacao text default null,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null,
  pagina int default 1,
  tamanho int default 30,
  destino_filtro text default null,
  sem_vicinais boolean default false,
  sem_canceladas boolean default false
)
returns table (
  chave_local text,
  chaves_locais text[],
  obras jsonb,
  qtd_obras int,
  extensao_total numeric,
  qtd_trechos int,
  tolerancia_m int,
  lat_inicio numeric,
  lon_inicio numeric,
  status text,
  observacao text,
  responsavel_id uuid,
  responsavel_nome text,
  solucionado_por_nome text,
  solucionado_em timestamptz,
  solucao text,
  revisado_em timestamptz,
  destino text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with b as (
    select p.*
    from public.sobreposicoes_pares p
    where public.is_admin_aprovado(auth.uid())
      and p.status = coalesce(nullif(filtro_status, ''), 'pendente')
      and (coalesce(destino_filtro, '') = '' or p.destino = destino_filtro)
      and (coalesce(cardinality(orgaos_filtro), 0) = 0 or p.d_orgaos && orgaos_filtro)
      and (coalesce(cardinality(anos_filtro), 0) = 0 or p.d_anos && anos_filtro)
      and (coalesce(cardinality(tipologias_filtro), 0) = 0 or p.d_tipologias && tipologias_filtro)
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(p.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(p.d_tipologias))
      )
      and (not ocultar_estrada_vicinal or not p.todas_estrada_vicinal)
      and (not sem_vicinais or not ('ESTRADA VICINAL' = any(p.d_tipologias)))
      and (not sem_canceladas or not exists (select 1 from unnest(p.d_status) st where upper(trim(st)) like 'CANCELAD%'))
      and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = p.todas_concluidas)
      and (coalesce(cardinality(status_obras_filtro), 0) = 0 or p.d_status && status_obras_filtro)
      and (pct_min is null or coalesce(p.d_pct_max, -1) >= pct_min)
      and (pct_max is null or coalesce(p.d_pct_max, 0) <= pct_max)
      and (coalesce(trim(busca), '') = '' or p.busca ilike '%' || trim(busca) || '%')
  ),
  pg as (
    select b.*, count(*) over() as total_geral
    from b
    order by b.extensao_total desc nulls last, b.grp
    limit tamanho offset (pagina - 1) * tamanho
  )
  select pg.chave_local, pg.chaves_locais, public.sobreposicao_obras_ativas(so.obras),
         jsonb_array_length(public.sobreposicao_obras_ativas(so.obras)), pg.extensao_total, pg.qtd_trechos,
         pg.tolerancia_m, pg.lat_inicio, pg.lon_inicio, pg.status, pg.observacao, pg.responsavel_id, pr.nome,
         ps.nome, pg.solucionado_em, pg.solucao, pg.revisado_em, pg.destino, pg.total_geral
  from pg
  join public.sobreposicoes so on so.chave_local = pg.chave_local
  left join public.profiles pr on pr.id = pg.responsavel_id
  left join public.profiles ps on ps.id = pg.solucionado_por
  order by pg.extensao_total desc nulls last, pg.grp;
$$;

create or replace function public.sobreposicoes_pares_resumo(
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null,
  sem_vicinais boolean default false,
  sem_canceladas boolean default false
)
returns table (concluidas boolean, destino text, pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.todas_concluidas, p.destino,
         count(*) filter (where p.status = 'pendente'),
         count(*) filter (where p.status = 'ok'),
         count(*) filter (where p.status = 'problema'),
         count(*) filter (where p.status = 'solucionado')
  from public.sobreposicoes_pares p
  where public.is_admin_aprovado(auth.uid())
    and (coalesce(cardinality(orgaos_filtro), 0) = 0 or p.d_orgaos && orgaos_filtro)
    and (coalesce(cardinality(anos_filtro), 0) = 0 or p.d_anos && anos_filtro)
    and (coalesce(cardinality(tipologias_filtro), 0) = 0 or p.d_tipologias && tipologias_filtro)
    and (
      coalesce(tipologia_todas_filtro, '') = ''
      or (cardinality(p.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(p.d_tipologias))
    )
    and (not ocultar_estrada_vicinal or not p.todas_estrada_vicinal)
    and (not sem_vicinais or not ('ESTRADA VICINAL' = any(p.d_tipologias)))
    and (not sem_canceladas or not exists (select 1 from unnest(p.d_status) st where upper(trim(st)) like 'CANCELAD%'))
    and (coalesce(cardinality(status_obras_filtro), 0) = 0 or p.d_status && status_obras_filtro)
    and (pct_min is null or coalesce(p.d_pct_max, -1) >= pct_min)
    and (pct_max is null or coalesce(p.d_pct_max, 0) <= pct_max)
    and (coalesce(trim(busca), '') = '' or p.busca ilike '%' || trim(busca) || '%')
  group by p.todas_concluidas, p.destino;
$$;

create or replace function public.sobreposicoes_pendencias_painel(
  filtro_status text default 'problema',
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null,
  destino_filtro text default null,
  sem_vicinais boolean default false,
  sem_canceladas boolean default false
)
returns table (tipo text, orgao text, pares bigint, metros numeric)
language sql
security definer
set search_path = public
stable
as $$
  with b as (
    select p.*
    from public.sobreposicoes_pares p
    where public.is_admin_aprovado(auth.uid())
      and p.status = coalesce(nullif(filtro_status, ''), 'problema')
      and (coalesce(destino_filtro, '') = '' or p.destino = destino_filtro)
      and (coalesce(cardinality(orgaos_filtro), 0) = 0 or p.d_orgaos && orgaos_filtro)
      and (coalesce(cardinality(anos_filtro), 0) = 0 or p.d_anos && anos_filtro)
      and (coalesce(cardinality(tipologias_filtro), 0) = 0 or p.d_tipologias && tipologias_filtro)
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(p.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(p.d_tipologias))
      )
      and (not ocultar_estrada_vicinal or not p.todas_estrada_vicinal)
      and (not sem_vicinais or not ('ESTRADA VICINAL' = any(p.d_tipologias)))
      and (not sem_canceladas or not exists (select 1 from unnest(p.d_status) st where upper(trim(st)) like 'CANCELAD%'))
      and (coalesce(cardinality(status_obras_filtro), 0) = 0 or p.d_status && status_obras_filtro)
      and (pct_min is null or coalesce(p.d_pct_max, -1) >= pct_min)
      and (pct_max is null or coalesce(p.d_pct_max, 0) <= pct_max)
      and (coalesce(trim(busca), '') = '' or p.busca ilike '%' || trim(busca) || '%')
  )
  select 'total'::text, null::text, count(*), coalesce(sum(b.extensao_total), 0) from b
  union all
  select 'orgao'::text, o, count(*), coalesce(sum(b.extensao_total), 0)
  from b, unnest(b.d_orgaos) o
  group by o;
$$;

revoke execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int, text, boolean, boolean) from public, anon;
revoke execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text, boolean, boolean) from public, anon;
revoke execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text, text, boolean, boolean) from public, anon;
grant execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int, text, boolean, boolean) to authenticated;
grant execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text, boolean, boolean) to authenticated;
grant execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text, text, boolean, boolean) to authenticated;

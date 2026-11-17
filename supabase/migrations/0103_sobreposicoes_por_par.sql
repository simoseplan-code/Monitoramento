-- SOBREPOSIÇÕES POR PAR DE OBRAS ("ID x ID"): um cartão por combinação de ações, juntando todos os trechos
-- onde elas se sobrepõem. A análise (sem problema / com problema / solucionado) vale para o par inteiro.
--
-- 1) Colunas calculadas novas: status das obras e maior percentual de execução do local (para os filtros novos).
-- 2) Análise unificada: onde um dos trechos do par já foi analisado, os outros trechos recebem a mesma análise.
-- 3) Funções novas da lista (agrupada por par), das contagens e das opções de filtro.

-- ---------- 1) colunas calculadas ----------
alter table public.sobreposicoes
  add column if not exists d_status text[] not null default '{}',
  add column if not exists d_pct_max numeric;

create or replace function public.sobreposicoes_atualizar_derivados()
returns int
language sql
security definer
set search_path = public
as $$
  with calc as (
    select
      s.chave_local,
      array(
        select distinct trim(e.value ->> 'orgao')
        from jsonb_array_elements(s.obras) e
        where coalesce(trim(e.value ->> 'orgao'), '') <> ''
      ) as orgaos,
      array(
        select distinct extract(year from o.data_criacao)::int
        from jsonb_array_elements(s.obras) e
        join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
        where o.data_criacao is not null
      ) as anos,
      -- Uma entrada por obra ('' quando a ação não está na base), igual aos filtros antigos.
      array(
        select upper(trim(coalesce(o.tipologia, '')))
        from jsonb_array_elements(s.obras) e
        left join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
      ) as tipologias,
      (
        jsonb_array_length(s.obras) > 0 and not exists (
          select 1
          from jsonb_array_elements(s.obras) e
          left join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
          where coalesce(nullif(o.status, ''), e.value ->> 'status', '') not ilike 'conclu%'
        )
      ) as todas_concluidas,
      array(
        select distinct trim(coalesce(nullif(o.status, ''), e.value ->> 'status', ''))
        from jsonb_array_elements(s.obras) e
        left join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
        where trim(coalesce(nullif(o.status, ''), e.value ->> 'status', '')) <> ''
      ) as statuses,
      (
        select max(o.percentual_execucao) * 100
        from jsonb_array_elements(s.obras) e
        join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
      ) as pct_max
    from public.sobreposicoes s
    where jsonb_typeof(s.obras) = 'array'
  ),
  alterados as (
    update public.sobreposicoes s
    set d_orgaos = c.orgaos,
        d_anos = c.anos,
        d_tipologias = c.tipologias,
        d_todas_concluidas = c.todas_concluidas,
        d_todas_estrada_vicinal = ('ESTRADA VICINAL' = all(c.tipologias)),
        d_status = c.statuses,
        d_pct_max = c.pct_max
    from calc c
    where s.chave_local = c.chave_local
    returning 1
  )
  select count(*)::int from alterados;
$$;

revoke execute on function public.sobreposicoes_atualizar_derivados() from public, anon, authenticated;
grant execute on function public.sobreposicoes_atualizar_derivados() to service_role;

-- ---------- 2) análise unificada por par ----------
with ref as (
  select distinct on (coalesce(chave_obras, chave_local))
    coalesce(chave_obras, chave_local) as grupo,
    status, observacao, responsavel_id, revisado_por, revisado_em, solucionado_por, solucionado_em, solucao
  from public.sobreposicoes
  where status <> 'pendente'
  order by coalesce(chave_obras, chave_local), atualizado_em desc nulls last
)
update public.sobreposicoes s
set status = r.status,
    observacao = r.observacao,
    responsavel_id = r.responsavel_id,
    revisado_por = r.revisado_por,
    revisado_em = r.revisado_em,
    solucionado_por = r.solucionado_por,
    solucionado_em = r.solucionado_em,
    solucao = r.solucao
from ref r
where s.status = 'pendente'
  and coalesce(s.chave_obras, s.chave_local) = r.grupo;

-- ---------- 3) funções ----------
-- Base: um registro por par (grupo), já com os filtros aplicados. Filtros em listas: vazio = sem filtro.
create or replace function public.sobreposicoes_pares_base(
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  grupo_situacao text default null,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null
)
returns table (
  grupo text,
  chave_local text,
  chaves_locais text[],
  obras jsonb,
  extensao_total numeric,
  qtd_trechos int,
  tolerancia_m int,
  lat_inicio numeric,
  lon_inicio numeric,
  status text,
  observacao text,
  responsavel_id uuid,
  solucionado_por uuid,
  solucionado_em timestamptz,
  solucao text,
  revisado_em timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with filtrado as (
    select s.*, coalesce(s.chave_obras, s.chave_local) as grp
    from public.sobreposicoes s
    where public.is_admin_aprovado(auth.uid())
      and jsonb_array_length(public.sobreposicao_obras_ativas(s.obras)) >= 2
      and (coalesce(cardinality(orgaos_filtro), 0) = 0 or s.d_orgaos && orgaos_filtro)
      and (coalesce(cardinality(anos_filtro), 0) = 0 or s.d_anos && anos_filtro)
      and (coalesce(cardinality(tipologias_filtro), 0) = 0 or s.d_tipologias && tipologias_filtro)
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
      )
      and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
      and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas)
      and (coalesce(cardinality(status_obras_filtro), 0) = 0 or s.d_status && status_obras_filtro)
      and (pct_min is null or coalesce(s.d_pct_max, -1) >= pct_min)
      and (pct_max is null or coalesce(s.d_pct_max, 0) <= pct_max)
      and (coalesce(trim(busca), '') = '' or s.obras::text ilike '%' || trim(busca) || '%')
  ),
  -- Quem manda no status do par: o trecho já analisado (o mais recente); senão, o maior.
  rep as (
    select distinct on (f.grp) f.grp, f.chave_local, f.obras, f.status, f.observacao, f.responsavel_id,
           f.solucionado_por, f.solucionado_em, f.solucao, f.revisado_em
    from filtrado f
    order by f.grp, (f.status <> 'pendente') desc, f.atualizado_em desc nulls last, f.extensao_m desc nulls last, f.chave_local
  ),
  maior as (
    select distinct on (f.grp) f.grp, f.tolerancia_m, f.lat_inicio, f.lon_inicio
    from filtrado f
    order by f.grp, f.extensao_m desc nulls last, f.chave_local
  ),
  soma as (
    select f.grp,
           sum(f.extensao_m) as ext,
           count(*)::int as n,
           array_agg(f.chave_local order by f.extensao_m desc nulls last, f.chave_local) as chaves
    from filtrado f
    group by f.grp
  )
  select r.grp, r.chave_local, so.chaves, public.sobreposicao_obras_ativas(r.obras), so.ext, so.n,
         m.tolerancia_m, m.lat_inicio, m.lon_inicio,
         r.status, r.observacao, r.responsavel_id, r.solucionado_por, r.solucionado_em, r.solucao, r.revisado_em
  from rep r
  join maior m on m.grp = r.grp
  join soma so on so.grp = r.grp;
$$;

revoke execute on function public.sobreposicoes_pares_base(text[], int[], text[], text, boolean, text, text[], numeric, numeric, text) from public, anon, authenticated;

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
  tamanho int default 30
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
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with b as (
    select * from public.sobreposicoes_pares_base(orgaos_filtro, anos_filtro, tipologias_filtro, tipologia_todas_filtro, ocultar_estrada_vicinal, grupo_situacao, status_obras_filtro, pct_min, pct_max, busca) x
    where x.status = coalesce(nullif(filtro_status, ''), 'pendente')
  ),
  p as (
    select b.*, count(*) over() as total_geral
    from b
    order by b.extensao_total desc nulls last, b.grupo
    limit tamanho offset (pagina - 1) * tamanho
  )
  select p.chave_local, p.chaves_locais, p.obras, jsonb_array_length(p.obras), p.extensao_total, p.qtd_trechos,
         p.tolerancia_m, p.lat_inicio, p.lon_inicio, p.status, p.observacao, p.responsavel_id, pr.nome,
         ps.nome, p.solucionado_em, p.solucao, p.revisado_em, p.total_geral
  from p
  left join public.profiles pr on pr.id = p.responsavel_id
  left join public.profiles ps on ps.id = p.solucionado_por
  order by p.extensao_total desc nulls last, p.grupo;
$$;

create or replace function public.sobreposicoes_pares_contagens(
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  grupo_situacao text default null,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null
)
returns table (pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where b.status = 'pendente'),
    count(*) filter (where b.status = 'ok'),
    count(*) filter (where b.status = 'problema'),
    count(*) filter (where b.status = 'solucionado')
  from public.sobreposicoes_pares_base(orgaos_filtro, anos_filtro, tipologias_filtro, tipologia_todas_filtro, ocultar_estrada_vicinal, grupo_situacao, status_obras_filtro, pct_min, pct_max, busca) b;
$$;

-- Opções do filtro "Status das obras".
create or replace function public.sobreposicoes_status_obras()
returns table (status text, qtd bigint)
language sql
security definer
set search_path = public
stable
as $$
  select t as status, count(distinct coalesce(s.chave_obras, s.chave_local)) as qtd
  from public.sobreposicoes s, unnest(s.d_status) t
  where public.is_admin_aprovado(auth.uid())
    and jsonb_array_length(public.sobreposicao_obras_ativas(s.obras)) >= 2
  group by t
  order by 2 desc, 1;
$$;

-- Contador do menu: pares aguardando revisão.
create or replace function public.contar_sobreposicoes_pendentes()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.sobreposicoes_pares_base() b
  where b.status = 'pendente';
$$;

revoke execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int) from public, anon;
revoke execute on function public.sobreposicoes_pares_contagens(text[], int[], text[], text, boolean, text, text[], numeric, numeric, text) from public, anon;
revoke execute on function public.sobreposicoes_status_obras() from public, anon;
revoke execute on function public.contar_sobreposicoes_pendentes() from public, anon;
grant execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int) to authenticated;
grant execute on function public.sobreposicoes_pares_contagens(text[], int[], text[], text, boolean, text, text[], numeric, numeric, text) to authenticated;
grant execute on function public.sobreposicoes_status_obras() to authenticated;
grant execute on function public.contar_sobreposicoes_pendentes() to authenticated;

-- Preenche as colunas novas para os locais já cadastrados.
select public.sobreposicoes_atualizar_derivados();

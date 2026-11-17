-- Sobreposições por par: versão rápida. Com ~11 mil locais, a 0103 estourava o tempo limite porque conferia as
-- ações desconsideradas linha a linha e carregava as colunas pesadas (geometria) em todas as etapas.
-- Agora: (1) a conta de "ações ativas" é feita de uma vez só, por junção; (2) a base não carrega nem as obras nem a
-- geometria; (3) as obras do cartão só são lidas para os 30 pares da página; (4) uma única chamada devolve as
-- contagens dos dois grupos (em andamento e concluída).

drop function if exists public.sobreposicoes_pares_base(text[], int[], text[], text, boolean, text, text[], numeric, numeric, text);

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
  revisado_em timestamptz,
  todas_concluidas boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with qtd as (
    -- Quantas ações ATIVAS (não desconsideradas) cada local tem, numa junção só.
    select s.chave_local, count(*) filter (where d.id_acao is null) as n
    from public.sobreposicoes s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.obras) = 'array' then s.obras else '[]'::jsonb end) e
    left join public.acoes_desconsideradas d on d.tela = 'todas' and d.id_acao = e.value ->> 'id'
    where public.is_admin_aprovado(auth.uid())
    group by s.chave_local
  ),
  filtrado as (
    select s.chave_local, coalesce(s.chave_obras, s.chave_local) as grp, s.extensao_m, s.tolerancia_m,
           s.lat_inicio, s.lon_inicio, s.status, s.observacao, s.responsavel_id, s.solucionado_por,
           s.solucionado_em, s.solucao, s.revisado_em, s.atualizado_em, s.d_todas_concluidas
    from public.sobreposicoes s
    join qtd q on q.chave_local = s.chave_local and q.n >= 2
    where (coalesce(cardinality(orgaos_filtro), 0) = 0 or s.d_orgaos && orgaos_filtro)
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
    select distinct on (f.grp) f.grp, f.chave_local, f.status, f.observacao, f.responsavel_id,
           f.solucionado_por, f.solucionado_em, f.solucao, f.revisado_em, f.d_todas_concluidas
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
  select r.grp, r.chave_local, so.chaves, so.ext, so.n,
         m.tolerancia_m, m.lat_inicio, m.lon_inicio,
         r.status, r.observacao, r.responsavel_id, r.solucionado_por, r.solucionado_em, r.solucao, r.revisado_em,
         r.d_todas_concluidas
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
  select p.chave_local, p.chaves_locais, public.sobreposicao_obras_ativas(so.obras),
         jsonb_array_length(public.sobreposicao_obras_ativas(so.obras)), p.extensao_total, p.qtd_trechos,
         p.tolerancia_m, p.lat_inicio, p.lon_inicio, p.status, p.observacao, p.responsavel_id, pr.nome,
         ps.nome, p.solucionado_em, p.solucao, p.revisado_em, p.total_geral
  from p
  join public.sobreposicoes so on so.chave_local = p.chave_local
  left join public.profiles pr on pr.id = p.responsavel_id
  left join public.profiles ps on ps.id = p.solucionado_por
  order by p.extensao_total desc nulls last, p.grupo;
$$;

-- Contagens dos dois grupos de uma vez (em andamento e concluída × concluída), seguindo os filtros da lateral.
create or replace function public.sobreposicoes_pares_resumo(
  orgaos_filtro text[] default null,
  anos_filtro int[] default null,
  tipologias_filtro text[] default null,
  tipologia_todas_filtro text default null,
  ocultar_estrada_vicinal boolean default false,
  status_obras_filtro text[] default null,
  pct_min numeric default null,
  pct_max numeric default null,
  busca text default null
)
returns table (concluidas boolean, pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select b.todas_concluidas,
         count(*) filter (where b.status = 'pendente'),
         count(*) filter (where b.status = 'ok'),
         count(*) filter (where b.status = 'problema'),
         count(*) filter (where b.status = 'solucionado')
  from public.sobreposicoes_pares_base(orgaos_filtro, anos_filtro, tipologias_filtro, tipologia_todas_filtro, ocultar_estrada_vicinal, null, status_obras_filtro, pct_min, pct_max, busca) b
  group by b.todas_concluidas;
$$;

revoke execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text) from public, anon;
grant execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text) to authenticated;

-- Contador do menu: leve (sem os filtros finos), conta pares aguardando revisão.
create or replace function public.contar_sobreposicoes_pendentes()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(s.chave_obras, s.chave_local))::int
  from public.sobreposicoes s
  where s.status = 'pendente' and public.is_admin_aprovado(auth.uid());
$$;

-- Opções do filtro "Status das obras": mais leve (sem a conta de ações ativas).
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
  group by t
  order by 2 desc, 1;
$$;

-- Índice que ajuda a agrupar por par e a achar o trecho do cartão.
create index if not exists sobreposicoes_chave_obras_status_idx on public.sobreposicoes (chave_obras, status);

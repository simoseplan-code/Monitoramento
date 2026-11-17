-- Sobreposições por par: a 0104 ainda estourava o tempo nos grupos grandes (a lista de Concluída × Concluída, pequena,
-- já funcionava). O banco repetia a conta de "ações ativas" para cada linha em vez de fazê-la uma vez só.
-- Aqui as duas etapas pesadas são forçadas a rodar uma vez (materialized) e depois juntadas.

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
  with qtd as materialized (
    -- Quantas ações ATIVAS (não desconsideradas) cada local tem, numa junção só.
    select s.chave_local, count(*) filter (where d.id_acao is null) as n
    from public.sobreposicoes s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.obras) = 'array' then s.obras else '[]'::jsonb end) e
    left join public.acoes_desconsideradas d on d.tela = 'todas' and d.id_acao = e.value ->> 'id'
    where public.is_admin_aprovado(auth.uid())
    group by s.chave_local
  ),
  filtrado as materialized (
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

-- Atualiza as estatísticas da tabela (as colunas novas foram preenchidas em massa) para o banco planejar melhor.
analyze public.sobreposicoes;

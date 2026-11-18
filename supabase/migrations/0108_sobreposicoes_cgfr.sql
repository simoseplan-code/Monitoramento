-- CGFR: destino alternativo para um par COM PROBLEMA. O botão "Tem problema" manda para a aba Pendências e o botão
-- vermelho "CGFR" manda para a aba CGFR. Os dois seguem o mesmo fluxo (observações, solucionado, relatórios).
-- Guarda-se o destino ao lado do status: status continua pendente / ok / problema / solucionado.

alter table public.sobreposicoes add column if not exists destino text not null default 'pendencias';
alter table public.sobreposicoes_pares add column if not exists destino text not null default 'pendencias';

create or replace function public.sobreposicoes_reconstruir_pares(so_grupo text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  delete from public.sobreposicoes_pares p where so_grupo is null or p.grp = so_grupo;

  with qtd as materialized (
    -- Quantas ações ATIVAS (não desconsideradas) cada local tem, numa junção só.
    select s.chave_local, count(*) filter (where d.id_acao is null) as qativas
    from public.sobreposicoes s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.obras) = 'array' then s.obras else '[]'::jsonb end) e
    left join public.acoes_desconsideradas d on d.tela = 'todas' and d.id_acao = e.value ->> 'id'
    where so_grupo is null or coalesce(s.chave_obras, s.chave_local) = so_grupo
    group by s.chave_local
  ),
  filtrado as materialized (
    select s.chave_local, coalesce(s.chave_obras, s.chave_local) as grp, s.extensao_m, s.tolerancia_m,
           s.lat_inicio, s.lon_inicio, s.status, s.observacao, s.responsavel_id, s.solucionado_por,
           s.solucionado_em, s.solucao, s.revisado_em, s.atualizado_em, s.d_todas_concluidas,
           s.d_todas_estrada_vicinal, s.d_orgaos, s.d_anos, s.d_tipologias, s.d_status, s.d_pct_max,
           s.destino, s.obras::text as obras_txt
    from public.sobreposicoes s
    join qtd q on q.chave_local = s.chave_local and q.qativas >= 2
  ),
  -- Quem manda no status do par: o trecho já analisado (o mais recente); senão, o maior.
  rep as (
    select distinct on (f.grp) f.*
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
           count(*)::int as ntrechos,
           array_agg(f.chave_local order by f.extensao_m desc nulls last, f.chave_local) as chaves
    from filtrado f
    group by f.grp
  )
  insert into public.sobreposicoes_pares (
    grp, chave_local, chaves_locais, extensao_total, qtd_trechos, tolerancia_m, lat_inicio, lon_inicio,
    status, observacao, responsavel_id, solucionado_por, solucionado_em, solucao, revisado_em,
    todas_concluidas, todas_estrada_vicinal, d_orgaos, d_anos, d_tipologias, d_status, d_pct_max, busca, destino
  )
  select r.grp, r.chave_local, so.chaves, so.ext, so.ntrechos, m.tolerancia_m, m.lat_inicio, m.lon_inicio,
         r.status, r.observacao, r.responsavel_id, r.solucionado_por, r.solucionado_em, r.solucao, r.revisado_em,
         r.d_todas_concluidas, r.d_todas_estrada_vicinal, r.d_orgaos, r.d_anos, r.d_tipologias, r.d_status, r.d_pct_max,
         r.obras_txt, r.destino
  from rep r
  join maior m on m.grp = r.grp
  join soma so on so.grp = r.grp;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.sobreposicoes_reconstruir_pares(text) from public, anon, authenticated;
grant execute on function public.sobreposicoes_reconstruir_pares(text) to service_role;

-- Funções com assinatura nova: remove as antigas para não ficar duas versões.
drop function if exists public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int);
drop function if exists public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text);
drop function if exists public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text);

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
  destino_filtro text default null
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
  busca text default null
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
  destino_filtro text default null
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

revoke execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int, text) from public, anon;
revoke execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text) from public, anon;
revoke execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text, text) from public, anon;
grant execute on function public.sobreposicoes_pares_lista(text, text[], int[], text[], text, boolean, text, text[], numeric, numeric, text, int, int, text) to authenticated;
grant execute on function public.sobreposicoes_pares_resumo(text[], int[], text[], text, boolean, text[], numeric, numeric, text) to authenticated;
grant execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text, text) to authenticated;

-- Refaz a tabela de pares com o destino.
select public.sobreposicoes_reconstruir_pares();
analyze public.sobreposicoes_pares;

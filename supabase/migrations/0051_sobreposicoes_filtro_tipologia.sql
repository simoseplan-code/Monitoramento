-- Filtros por tipologia em Sobreposições: "pelo menos uma" das obras envolvidas
-- ser da tipologia escolhida, ou "todas" as obras serem dela. Parte 1: lista de tipologias e
-- contagens das abas (a lista paginada vem na migration 0052).

create or replace function public.sobreposicoes_tipologias()
returns table (tipologia text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(o.tipologia) as tipologia
  from public.sobreposicoes s
  cross join lateral jsonb_array_elements(s.obras) elem
  join public.obras o on o.id_acao = elem.value ->> 'id'
  where trim(coalesce(o.tipologia, '')) <> ''
  order by 1;
$$;

drop function if exists public.sobreposicoes_contagens(text, int, boolean);

create or replace function public.sobreposicoes_contagens(
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null
)
returns table (pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where s.status = 'pendente'),
    count(*) filter (where s.status = 'ok'),
    count(*) filter (where s.status = 'problema'),
    count(*) filter (where s.status = 'solucionado')
  from public.sobreposicoes s
  where (
      orgao_filtro is null or orgao_filtro = '' or exists (
        select 1 from jsonb_array_elements(s.obras) elem
        where trim(elem.value ->> 'orgao') = orgao_filtro
      )
    )
    and (
      ano_filtro is null or exists (
        select 1
        from jsonb_array_elements(s.obras) elem
        join public.obras o on o.id_acao = elem.value ->> 'id'
        where extract(year from o.data_criacao)::int = ano_filtro
      )
    )
    and (
      not ocultar_estrada_vicinal or exists (
        select 1
        from jsonb_array_elements(s.obras) elem
        left join public.obras o on o.id_acao = elem.value ->> 'id'
        where upper(trim(coalesce(o.tipologia, ''))) is distinct from 'ESTRADA VICINAL'
      )
    )
    and (
      tipologia_filtro is null or tipologia_filtro = '' or exists (
        select 1
        from jsonb_array_elements(s.obras) elem
        join public.obras o on o.id_acao = elem.value ->> 'id'
        where upper(trim(coalesce(o.tipologia, ''))) = upper(trim(tipologia_filtro))
      )
    )
    and (
      tipologia_todas_filtro is null or tipologia_todas_filtro = '' or (
        jsonb_array_length(s.obras) > 0 and not exists (
          select 1
          from jsonb_array_elements(s.obras) elem
          left join public.obras o on o.id_acao = elem.value ->> 'id'
          where upper(trim(coalesce(o.tipologia, ''))) is distinct from upper(trim(tipologia_todas_filtro))
        )
      )
    );
$$;

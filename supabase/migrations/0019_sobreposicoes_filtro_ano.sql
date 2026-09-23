-- Filtro "pelo menos uma obra do grupo criada no ano X" em
-- Sobreposições. O jsonb `sobreposicoes.obras` guarda só o id de cada
-- ação (ver lib/sobreposicoes/parseCsv.ts) — a Data de Criação vem da
-- tabela `obras` (sincronizada do SIMO), então precisa de join via
-- jsonb_array_elements, o que não dá pra expressar com os filtros
-- PostgREST simples que a página já usava (.contains/.eq) — por isso
-- migrando a listagem inteira pra uma RPC, igual novas_acoes_lista.

create or replace function public.sobreposicoes_anos()
returns table (ano int)
language sql
security definer
set search_path = public
stable
as $$
  select distinct extract(year from o.data_criacao)::int as ano
  from public.sobreposicoes s
  cross join lateral jsonb_array_elements(s.obras) as elem
  join public.obras o on o.id_acao = elem.value ->> 'id'
  where o.data_criacao is not null
  order by 1 desc;
$$;

create or replace function public.sobreposicoes_lista(
  mostrar_revisadas boolean default false,
  orgao_filtro text default null,
  ano_filtro int default null,
  pagina int default 1,
  tamanho int default 30
)
returns table (
  chave_local text,
  obras jsonb,
  qtd_obras int,
  extensao_m numeric,
  tolerancia_m int,
  qtd_segmentos int,
  lat_inicio numeric,
  lon_inicio numeric,
  lat_fim numeric,
  lon_fim numeric,
  status text,
  observacao text,
  importado_em timestamptz,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select s.*
    from public.sobreposicoes s
    where (case when mostrar_revisadas then s.status <> 'pendente' else s.status = 'pendente' end)
      and (
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
  )
  select
    base.chave_local, base.obras, base.qtd_obras, base.extensao_m, base.tolerancia_m,
    base.qtd_segmentos, base.lat_inicio, base.lon_inicio, base.lat_fim, base.lon_fim,
    base.status, base.observacao, base.importado_em,
    count(*) over() as total_geral
  from base
  order by base.extensao_m desc nulls last
  limit tamanho offset (pagina - 1) * tamanho;
$$;

-- Lista de Sobreposições devolve o responsável (id e nome) de cada local.
drop function if exists public.sobreposicoes_lista(text, text, int, boolean, int, int);

create or replace function public.sobreposicoes_lista(
  filtro_status text default 'pendente',
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
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
  responsavel_id uuid,
  responsavel_nome text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select s.*, p.nome as responsavel_nome
    from public.sobreposicoes s
    left join public.profiles p on p.id = s.responsavel_id
    where s.status = coalesce(nullif(filtro_status, ''), 'pendente')
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
      and (
        not ocultar_estrada_vicinal or exists (
          select 1
          from jsonb_array_elements(s.obras) elem
          left join public.obras o on o.id_acao = elem.value ->> 'id'
          where upper(trim(coalesce(o.tipologia, ''))) is distinct from 'ESTRADA VICINAL'
        )
      )
  )
  select
    base.chave_local, base.obras, base.qtd_obras, base.extensao_m, base.tolerancia_m,
    base.qtd_segmentos, base.lat_inicio, base.lon_inicio, base.lat_fim, base.lon_fim,
    base.status, base.observacao, base.importado_em,
    base.responsavel_id, base.responsavel_nome,
    count(*) over() as total_geral
  from base
  order by base.extensao_m desc nulls last
  limit tamanho offset (pagina - 1) * tamanho;
$$;

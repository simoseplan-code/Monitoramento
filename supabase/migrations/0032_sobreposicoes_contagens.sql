-- Contagens dos botões de status de Sobreposições respeitando os filtros
-- de órgão e de ano (antes eram totais fixos e não mudavam ao filtrar).
-- Mesmo critério de sobreposicoes_lista, sem o status.
create or replace function public.sobreposicoes_contagens(
  orgao_filtro text default null,
  ano_filtro int default null
)
returns table (pendente bigint, ok bigint, problema bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where s.status = 'pendente'),
    count(*) filter (where s.status = 'ok'),
    count(*) filter (where s.status = 'problema')
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
    );
$$;

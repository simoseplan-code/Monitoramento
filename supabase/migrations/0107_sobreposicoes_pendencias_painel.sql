-- Aba "Pendências" de Sobreposições: resumo dos pares COM PROBLEMA (ou solucionados) para o painel de cima:
-- uma linha de total e uma linha por órgão envolvido (quantos pares e quantos metros). Lê só a tabela pronta
-- sobreposicoes_pares, então é rápido. Segue os mesmos filtros da lateral.

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
  busca text default null
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

revoke execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text) from public, anon;
grant execute on function public.sobreposicoes_pendencias_painel(text, text[], int[], text[], text, boolean, text[], numeric, numeric, text) to authenticated;

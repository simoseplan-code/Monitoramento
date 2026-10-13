-- Sobreposições rápidas: com ~2.800 locais, a lista e as contagens estouravam o tempo
-- limite, porque cada filtro abria o jsonb das obras e cruzava com a tabela de ações
-- (13 mil linhas, com a regra de acesso avaliada linha a linha).
-- Agora o que os filtros precisam fica calculado em colunas do próprio local,
-- recalculadas na importação do CSV e a cada sincronização com o SIMO.

alter table public.sobreposicoes
  add column if not exists d_orgaos text[] not null default '{}',
  add column if not exists d_anos int[] not null default '{}',
  add column if not exists d_tipologias text[] not null default '{}',
  add column if not exists d_todas_concluidas boolean not null default false,
  add column if not exists d_todas_estrada_vicinal boolean not null default false;

create index if not exists sobreposicoes_status_extensao_idx on public.sobreposicoes (status, extensao_m desc);

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
        join public.obras o on o.id_acao = e.value ->> 'id'
        where o.data_criacao is not null
      ) as anos,
      -- Uma entrada por obra ('' quando a ação não está na base), igual aos filtros antigos.
      array(
        select upper(trim(coalesce(o.tipologia, '')))
        from jsonb_array_elements(s.obras) e
        left join public.obras o on o.id_acao = e.value ->> 'id'
      ) as tipologias,
      (
        jsonb_array_length(s.obras) > 0 and not exists (
          select 1
          from jsonb_array_elements(s.obras) e
          left join public.obras o on o.id_acao = e.value ->> 'id'
          where coalesce(nullif(o.status, ''), e.value ->> 'status', '') not ilike 'conclu%'
        )
      ) as todas_concluidas
    from public.sobreposicoes s
    where jsonb_typeof(s.obras) = 'array'
  ),
  alterados as (
    update public.sobreposicoes s
    set d_orgaos = c.orgaos,
        d_anos = c.anos,
        d_tipologias = c.tipologias,
        d_todas_concluidas = c.todas_concluidas,
        d_todas_estrada_vicinal = ('ESTRADA VICINAL' = all(c.tipologias))
    from calc c
    where s.chave_local = c.chave_local
    returning 1
  )
  select count(*)::int from alterados;
$$;

revoke execute on function public.sobreposicoes_atualizar_derivados() from public, anon, authenticated;
grant execute on function public.sobreposicoes_atualizar_derivados() to service_role;

-- Lista e contagens: mesmos parâmetros e mesmo resultado de antes, só que filtrando
-- pelas colunas calculadas. Rodam como dono (sem a regra de linha a linha) e conferem
-- uma vez só que quem chama é admin ou chefe aprovado.
create or replace function public.sobreposicoes_lista(
  filtro_status text default 'pendente',
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  pagina int default 1,
  tamanho int default 30,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null,
  grupo_situacao text default null
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
  solucionado_por_nome text,
  solucionado_em timestamptz,
  solucao text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select s.chave_local, s.obras, s.qtd_obras, s.extensao_m, s.tolerancia_m, s.qtd_segmentos,
           s.lat_inicio, s.lon_inicio, s.lat_fim, s.lon_fim, s.status, s.observacao, s.importado_em,
           s.responsavel_id, s.solucionado_por, s.solucionado_em, s.solucao
    from public.sobreposicoes s
    where public.is_admin_aprovado(auth.uid())
      and s.status = coalesce(nullif(filtro_status, ''), 'pendente')
      and (coalesce(orgao_filtro, '') = '' or orgao_filtro = any(s.d_orgaos))
      and (ano_filtro is null or ano_filtro = any(s.d_anos))
      and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
      and (coalesce(tipologia_filtro, '') = '' or upper(trim(tipologia_filtro)) = any(s.d_tipologias))
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
      )
      and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas)
  ),
  pagina_atual as (
    select base.*, count(*) over() as total_geral
    from base
    order by base.extensao_m desc nulls last, base.chave_local
    limit tamanho offset (pagina - 1) * tamanho
  )
  select
    p.chave_local, p.obras, p.qtd_obras, p.extensao_m, p.tolerancia_m,
    p.qtd_segmentos, p.lat_inicio, p.lon_inicio, p.lat_fim, p.lon_fim,
    p.status, p.observacao, p.importado_em,
    p.responsavel_id, pr.nome, ps.nome, p.solucionado_em, p.solucao,
    p.total_geral
  from pagina_atual p
  left join public.profiles pr on pr.id = p.responsavel_id
  left join public.profiles ps on ps.id = p.solucionado_por
  order by p.extensao_m desc nulls last, p.chave_local;
$$;

create or replace function public.sobreposicoes_contagens(
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null,
  grupo_situacao text default null
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
  where public.is_admin_aprovado(auth.uid())
    and (coalesce(orgao_filtro, '') = '' or orgao_filtro = any(s.d_orgaos))
    and (ano_filtro is null or ano_filtro = any(s.d_anos))
    and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
    and (coalesce(tipologia_filtro, '') = '' or upper(trim(tipologia_filtro)) = any(s.d_tipologias))
    and (
      coalesce(tipologia_todas_filtro, '') = ''
      or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
    )
    and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas);
$$;

revoke execute on function public.sobreposicoes_lista(text, text, int, boolean, int, int, text, text, text) from public, anon;
revoke execute on function public.sobreposicoes_contagens(text, int, boolean, text, text, text) from public, anon;
grant execute on function public.sobreposicoes_lista(text, text, int, boolean, int, int, text, text, text) to authenticated;
grant execute on function public.sobreposicoes_contagens(text, int, boolean, text, text, text) to authenticated;


-- Opções dos filtros, também pelas colunas calculadas.
create or replace function public.sobreposicoes_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o as orgao
  from public.sobreposicoes s, unnest(s.d_orgaos) o
  where public.is_admin_aprovado(auth.uid())
  order by 1;
$$;

create or replace function public.sobreposicoes_anos()
returns table (ano int)
language sql
security definer
set search_path = public
stable
as $$
  select distinct a as ano
  from public.sobreposicoes s, unnest(s.d_anos) a
  where public.is_admin_aprovado(auth.uid())
  order by 1 desc;
$$;

create or replace function public.sobreposicoes_tipologias()
returns table (tipologia text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct t as tipologia
  from public.sobreposicoes s, unnest(s.d_tipologias) t
  where public.is_admin_aprovado(auth.uid()) and t <> ''
  order by 1;
$$;

-- Preenche agora para os locais já importados.
select public.sobreposicoes_atualizar_derivados();

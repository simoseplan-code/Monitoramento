-- ── PARTE A: Sobreposições não "esquecer" análise já feita ──────────
-- "Chave do Local" (chave_local) inclui coordenada — se o Mapa de Obras
-- recalcular a geometria com precisão levemente diferente entre
-- exportações, o MESMO par de obras já revisado pode virar uma chave
-- nova e reaparecer como pendente. chave_obras (IDs das obras
-- envolvidas, ordenados) é estável entre exportações — usada pra
-- carregar adiante a decisão já tomada (ver app/api/sobreposicoes/importar).
alter table public.sobreposicoes add column if not exists chave_obras text;

update public.sobreposicoes s
set chave_obras = (
  select string_agg(elem.value ->> 'id', ',' order by elem.value ->> 'id')
  from jsonb_array_elements(s.obras) elem
  where elem.value ->> 'id' is not null
)
where chave_obras is null;

create index if not exists sobreposicoes_chave_obras_idx on public.sobreposicoes (chave_obras);

-- ── PARTE B: Unidade/Quantidade — filtro por ano de criação ─────────
create or replace function public.unidade_sugestao_anos()
returns table (ano int)
language sql
security definer
set search_path = public
stable
as $$
  select distinct extract(year from o.data_criacao)::int as ano
  from public.obras_unidade_sugestao s
  join public.obras o on o.id_acao = s.id_acao
  where o.data_criacao is not null
  order by 1 desc;
$$;

drop function if exists public.unidade_sugestao_lista(text, text, text, boolean, int, int);

create or replace function public.unidade_sugestao_lista(
  busca text default null,
  orgao_filtro text default null,
  confianca_filtro text default null,
  mostrar_aplicadas boolean default false,
  ano_minimo int default null,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  tipologia text,
  unidade_atual text,
  quantidade_atual text,
  unidade_sugerida text,
  quantidade_sugerida text,
  sem_quantidade boolean,
  unidade_final text,
  quantidade_final text,
  confianca text,
  aviso_tipologia boolean,
  motivo text,
  aprovado boolean,
  aplicado_em timestamptz,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.tipologia,
      s.unidade_atual,
      s.quantidade_atual,
      s.unidade_sugerida,
      s.quantidade_sugerida,
      s.sem_quantidade,
      s.unidade_final,
      s.quantidade_final,
      s.confianca,
      s.aviso_tipologia,
      s.motivo,
      s.aprovado,
      s.aplicado_em
    from public.obras_unidade_sugestao s
    join public.obras o on o.id_acao = s.id_acao
    where (mostrar_aplicadas or s.aplicado_em is null)
      and (confianca_filtro is null or confianca_filtro = '' or s.confianca = confianca_filtro)
      and (ano_minimo is null or extract(year from o.data_criacao) >= ano_minimo)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select base.*, count(*) over() as total_geral
  from base
  order by
    case when aplicado_em is not null then 2 when aprovado then 1 else 0 end,
    id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

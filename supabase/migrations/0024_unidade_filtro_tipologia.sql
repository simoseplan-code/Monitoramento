-- Filtro de tipologia na tela de Unidade/Quantidade. O valor especial
-- '__sem__' filtra as ações SEM tipologia (campo vazio no SIMO), que são
-- justamente as que o motor só consegue adivinhar pelo nome.

create or replace function public.unidade_sugestao_tipologias()
returns table (tipologia text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(o.tipologia) as tipologia
  from public.obras_unidade_sugestao s
  join public.obras o on o.id_acao = s.id_acao
  where coalesce(trim(o.tipologia), '') <> ''
  order by 1;
$$;

drop function if exists public.unidade_sugestao_lista(text, text, text, text, int, int, int);

create or replace function public.unidade_sugestao_lista(
  busca text default null,
  orgao_filtro text default null,
  confianca_filtro text default null,
  filtro_status text default 'pendentes',
  ano_minimo int default null,
  pagina int default 1,
  tamanho int default 50,
  tipologia_filtro text default null
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  tipologia text,
  status_acao text,
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
      o.status as status_acao,
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
    where (
      case filtro_status
        when 'aplicadas' then s.aplicado_em is not null
        when 'aprovadas' then s.aprovado = true and s.aplicado_em is null
        when 'todas' then true
        else s.aprovado = false and s.aplicado_em is null
      end
    )
      and (confianca_filtro is null or confianca_filtro = '' or s.confianca = confianca_filtro)
      and (ano_minimo is null or extract(year from o.data_criacao) >= ano_minimo)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
      and (
        tipologia_filtro is null or tipologia_filtro = ''
        or (tipologia_filtro = '__sem__' and coalesce(trim(o.tipologia), '') = '')
        or trim(o.tipologia) = tipologia_filtro
      )
  )
  select base.*, count(*) over() as total_geral
  from base
  order by
    case when aplicado_em is not null then 2 when aprovado then 1 else 0 end,
    case when lower(coalesce(status_acao, '')) in ('concluído', 'concluido') then 1 else 0 end,
    case when id_acao ~ '^[0-9]+$' then id_acao::bigint end desc nulls last,
    id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

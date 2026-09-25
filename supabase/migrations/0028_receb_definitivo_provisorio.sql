-- Duas colunas novas do relatório do SIMO: RECEB. DEFINITIVO e RECEB.
-- PROVISÓRIO (datas). Na tela de Termos o filtro de datas passa a usar o
-- recebimento da ação: vale o DEFINITIVO; o provisório só entra quando
-- não existe definitivo (coalesce).

alter table public.obras
  add column if not exists data_receb_definitivo date,
  add column if not exists data_receb_provisorio date;

create or replace function public.termos_contagens(
  tipo_filtro text default null,
  orgao_filtro text default null,
  data_de date default null,
  data_ate date default null,
  busca text default null
)
returns table (pendente bigint, corrigido bigint, problema bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where coalesce(r.status, 'pendente') = 'pendente'),
    count(*) filter (where r.status = 'corrigido'),
    count(*) filter (where r.status = 'problema')
  from public.obras o
  left join public.obras_termos_revisao r on r.id_acao = o.id_acao
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and (
      tipo_filtro is null or tipo_filtro = ''
      or (tipo_filtro = 'tei' and o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%')
      or (tipo_filtro = 'rescisao' and o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    )
    and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
    and (data_de is null or coalesce(o.data_receb_definitivo, o.data_receb_provisorio) >= data_de)
    and (data_ate is null or coalesce(o.data_receb_definitivo, o.data_receb_provisorio) <= data_ate)
    and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%');
$$;

drop function if exists public.termos_lista(text, text, text, date, date, text, int, int);

create or replace function public.termos_lista(
  filtro_status text default 'pendente',
  tipo_filtro text default null,
  orgao_filtro text default null,
  data_de date default null,
  data_ate date default null,
  busca text default null,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  data_recebimento date,
  tipo_recebimento text,
  tipo_documento text,
  numero_automatico text,
  status_revisao text,
  observacao text,
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
      o.data_criacao,
      coalesce(o.data_receb_definitivo, o.data_receb_provisorio) as data_recebimento,
      case when o.data_receb_definitivo is not null then 'definitivo' when o.data_receb_provisorio is not null then 'provisorio' end as tipo_recebimento,
      o.tipo_outros_documentos as tipo_documento,
      o.numero_automatico,
      coalesce(r.status, 'pendente') as status_revisao,
      r.observacao
    from public.obras o
    left join public.obras_termos_revisao r on r.id_acao = o.id_acao
    where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
      and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
      and coalesce(r.status, 'pendente') = coalesce(nullif(filtro_status, ''), 'pendente')
      and (
        tipo_filtro is null or tipo_filtro = ''
        or (tipo_filtro = 'tei' and o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%')
        or (tipo_filtro = 'rescisao' and o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
      )
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
      and (data_de is null or coalesce(o.data_receb_definitivo, o.data_receb_provisorio) >= data_de)
      and (data_ate is null or coalesce(o.data_receb_definitivo, o.data_receb_provisorio) <= data_ate)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by data_recebimento desc nulls last, case when id_acao ~ '^[0-9]+$' then id_acao::bigint end desc nulls last
  limit tamanho offset (pagina - 1) * tamanho;
$$;

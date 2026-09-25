-- Conferência de "Tipo Outros Documentos": ações CONCLUÍDAS com Termo de
-- Encerramento por Inatividade (TEI) ou Termo de Rescisão. A decisão da
-- equipe (corrigido / tem problema) fica numa tabela separada de obras,
-- porque obras é sobrescrita pelo sync do SIMO a cada rodada.

create table public.obras_termos_revisao (
  id_acao text primary key references public.obras(id_acao) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'corrigido', 'problema')),
  observacao text,
  revisado_por uuid references public.profiles(id),
  revisado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.obras_termos_revisao enable row level security;

create policy "equipe aprovada le termos"
  on public.obras_termos_revisao for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada insere termos"
  on public.obras_termos_revisao for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada atualiza termos"
  on public.obras_termos_revisao for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create or replace function public.contar_termos_pendentes()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  left join public.obras_termos_revisao r on r.id_acao = o.id_acao
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and coalesce(r.status, 'pendente') = 'pendente';
$$;

create or replace function public.termos_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras o
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and o.orgao is not null
  order by 1;
$$;

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
    and (data_de is null or o.data_criacao >= data_de)
    and (data_ate is null or o.data_criacao <= data_ate)
    and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%');
$$;

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
      and (data_de is null or o.data_criacao >= data_de)
      and (data_ate is null or o.data_criacao <= data_ate)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by data_criacao desc nulls last, case when id_acao ~ '^[0-9]+$' then id_acao::bigint end desc nulls last
  limit tamanho offset (pagina - 1) * tamanho;
$$;

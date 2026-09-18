-- Corrige o `.limit(500)` que existia no código do Next.js pra listar
-- "Novas Ações" — ele cortava silenciosamente ações mais antigas
-- conforme a base cresce todo dia. A paginação de verdade agora roda
-- toda no banco: filtro, junção com obras_revisao e corte de página
-- numa função só, sem teto escondido em lugar nenhum.
create or replace function public.novas_acoes_lista(
  data_inicio date,
  busca text default null,
  orgao_filtro text default null,
  mostrar_concluidos boolean default false,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  kml_anexado text,
  sem_duplicacao text,
  trecho_unico text,
  documentos_obrigatorios text,
  concluido boolean,
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
      coalesce(r.kml_anexado, 'pendente') as kml_anexado,
      coalesce(r.sem_duplicacao, 'pendente') as sem_duplicacao,
      coalesce(r.trecho_unico, 'pendente') as trecho_unico,
      coalesce(r.documentos_obrigatorios, 'pendente') as documentos_obrigatorios,
      coalesce(r.concluido, false) as concluido
    from public.obras o
    left join public.obras_revisao r on r.id_acao = o.id_acao
    where o.data_criacao >= data_inicio
      and o.data_criacao <= (current_date - interval '1 day')
      and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
      and (mostrar_concluidos or coalesce(r.concluido, false) = false)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select base.*, count(*) over() as total_geral
  from base
  order by data_criacao desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

-- Lista de órgãos pra popular o filtro — DISTINCT no banco, não
-- importa quantas linhas existam.
create or replace function public.novas_acoes_orgaos(data_inicio date)
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras o
  where o.data_criacao >= data_inicio
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and o.orgao is not null
  order by o.orgao;
$$;

-- Contagem de itens com algum check "aguardando atualização" (não
-- concluídos) — usada só pro texto do subtítulo da página.
create or replace function public.contar_aguardando_atualizacao(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  join public.obras_revisao r on r.id_acao = o.id_acao
  where o.data_criacao >= data_inicio
    and o.data_criacao <= (current_date - interval '1 day')
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and coalesce(r.concluido, false) = false
    and (
      r.kml_anexado = 'aguardando_atualizacao'
      or r.sem_duplicacao = 'aguardando_atualizacao'
      or r.trecho_unico = 'aguardando_atualizacao'
      or r.documentos_obrigatorios = 'aguardando_atualizacao'
    );
$$;

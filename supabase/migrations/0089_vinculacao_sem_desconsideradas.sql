-- Vinculação SIAFE: além das ações desconsideradas em "Todas as análises", NÃO entram na Vinculação as
-- ações da lista "Não vinculadas SIAFE" (menu Ações desconsideradas): são as que a equipe decidiu não vincular.
-- Vale para a lista, os filtros por órgão, o contador do menu e o número do botão "Vincular ... no SIMO".
-- (O botão em si, que grava no SIMO, também passa a pular esses IDs: isso está no código.)

create or replace view public.obras_vinculaveis as
select v.*
from public.obras_visiveis v
where not exists (
  select 1 from public.acoes_desconsideradas d
  where d.tela = 'nao_vinculadas' and d.id_acao = v.id_acao
);

revoke all on public.obras_vinculaveis from public, anon, authenticated;

create or replace function public.vinculacao_lista(
  busca text default null,
  orgao_filtro text default null,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  estagio_atual text,
  status text,
  numero_siafe text,
  situacao text,
  falhou_antes boolean,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with pendentes as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.estagio_atual,
      o.status,
      o.numero_siafe,
      case
        when upper(coalesce(o.orgao, '')) = 'AGESPISA' then 'Órgão não possui SIAFE'
        when o.numero_siafe !~ '^[0-9]{8}$' then 'Formato inválido (não são 8 dígitos)'
        when o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe then o.vinculacao_ultimo_erro
        else null
      end as situacao,
      (o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe) as falhou_antes
    from public.obras_vinculaveis o
    where o.numero_automatico is null
      and o.numero_siafe is not null
      and coalesce(lower(o.status), '') <> 'cancelado'
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select pendentes.*, count(*) over() as total_geral
  from pendentes
  order by (situacao is not null) desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.vinculacao_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_vinculaveis o
  where o.numero_automatico is null
    and o.numero_siafe is not null
    and coalesce(lower(o.status), '') <> 'cancelado'
    and o.orgao is not null
  order by o.orgao;
$$;

create or replace function public.contar_vinculacao_pendentes_validas()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_vinculaveis o
  where o.numero_automatico is null
    and o.numero_siafe ~ '^[0-9]{8}$'
    and coalesce(lower(o.status), '') <> 'cancelado'
    and upper(coalesce(o.orgao, '')) <> 'AGESPISA'
    and not (o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe);
$$;

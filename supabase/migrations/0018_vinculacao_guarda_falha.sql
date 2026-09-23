-- Guarda o erro da última tentativa de vinculação por ação, pra "Vincular
-- todas as válidas" não ficar reprocessando o mesmo erro todo dia — só
-- tenta de novo automaticamente se o Número do Contrato no SIAFE mudou
-- desde a falha (equipe corrigiu no SIMO). Correção pontual continua
-- possível a qualquer momento via retry individual no card.

alter table public.obras
  add column if not exists vinculacao_ultimo_erro text,
  add column if not exists vinculacao_numero_tentado text,
  add column if not exists vinculacao_falhou_em timestamptz;

drop function if exists public.vinculacao_lista(text, text, int, int);

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
    from public.obras o
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

-- Só conta como "pronta pra vincular em lote" quem não tem um erro
-- registrado pro número atual — quem falhou continua fora do lote até
-- o número mudar ou alguém tentar de novo individualmente.
create or replace function public.contar_vinculacao_pendentes_validas()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  where o.numero_automatico is null
    and o.numero_siafe ~ '^[0-9]{8}$'
    and coalesce(lower(o.status), '') <> 'cancelado'
    and upper(coalesce(o.orgao, '')) <> 'AGESPISA'
    and not (o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe);
$$;

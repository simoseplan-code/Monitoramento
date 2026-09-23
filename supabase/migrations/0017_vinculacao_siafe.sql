-- Vinculação de Contrato SIAFE — porta a function que grava no SIMO
-- (_vincularContratoSiafe do Apps Script "AUTOMAÇÃO VINCULAÇÃO").
-- Diferente de Unidade/Quantidade, "pendente" e "válido" são
-- deriváveis direto das colunas já sincronizadas (numero_automatico,
-- numero_siafe, status, orgao) — sem motor de sugestão por texto, sem
-- tabela de sugestão calculada, tudo roda em SQL puro.

create table public.obras_vinculacao_log (
  id bigint generated always as identity primary key,
  id_acao text not null,
  nome_acao text,
  numero_siafe text,
  http_code int,
  resultado text not null,
  resposta_bruta text,
  executado_por uuid references public.profiles(id),
  executado_em timestamptz not null default now()
);

alter table public.obras_vinculacao_log enable row level security;

create policy "admin le log vinculacao"
  on public.obras_vinculacao_log for select
  using (public.is_admin_aprovado(auth.uid()));

-- "Pendente" = tem Número do Contrato no SIAFE mas ainda não tem Número
-- Automático (o SIMO só cria o Número Automático depois de vinculado).
-- "situacao" não-nula = motivo de não estar pronta pra vincular
-- automaticamente (precisa de correção manual antes).
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
        else null
      end as situacao
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

create or replace function public.vinculacao_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras o
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
  from public.obras o
  where o.numero_automatico is null
    and o.numero_siafe ~ '^[0-9]{8}$'
    and coalesce(lower(o.status), '') <> 'cancelado'
    and upper(coalesce(o.orgao, '')) <> 'AGESPISA';
$$;

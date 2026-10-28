-- Verificação de bairros: para cada ação que tem traçado guardado (o do mapa, ou o KML baixado do
-- SIMO), em quais bairros ele cai e quanto do trecho fica dentro de cada um.
--
-- O cálculo é guardado aqui para não rodar toda vez. Só reprocessa a ação cujo traçado mudou
-- (assinatura = md5 do WKT). Regra de conflito igual à das Sobreposições: se a ação tem traçado
-- vindo do mapa, ele vale; o KML guardado só entra para a ação que o mapa não tem.
-- Só o servidor grava (service_role); equipe aprovada lê.

create table if not exists public.acao_bairros_calculo (
  id_acao text primary key,
  fonte text not null check (fonte in ('sobreposicoes', 'kml')),
  assinatura text not null,
  extensao_m double precision not null default 0,
  metros_fora double precision not null default 0,   -- parte do trecho que não cai em nenhum bairro mapeado
  qtd_bairros integer not null default 0,
  calculado_em timestamptz not null default now()
);

create table if not exists public.acao_bairros (
  id_acao text not null,
  municipio text not null,
  bairro text not null,
  metros double precision not null,
  pct double precision not null,                      -- fração do trecho (0 a 1) dentro deste bairro
  primary key (id_acao, municipio, bairro)
);

create index if not exists acao_bairros_local_idx on public.acao_bairros (municipio, bairro);

alter table public.acao_bairros_calculo enable row level security;
alter table public.acao_bairros enable row level security;

drop policy if exists "equipe aprovada le acao_bairros_calculo" on public.acao_bairros_calculo;
create policy "equipe aprovada le acao_bairros_calculo"
  on public.acao_bairros_calculo for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada le acao_bairros" on public.acao_bairros;
create policy "equipe aprovada le acao_bairros"
  on public.acao_bairros for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

grant select on public.acao_bairros_calculo, public.acao_bairros to authenticated;

-- Lista pronta para a tela: uma linha por ação e bairro (ou uma linha só, sem bairro, quando o trecho
-- não cai em nenhum bairro mapeado).
create or replace view public.acao_bairros_lista
with (security_invoker = true) as
select
  c.id_acao,
  c.fonte,
  c.extensao_m,
  c.metros_fora,
  c.calculado_em,
  b.municipio,
  b.bairro,
  b.metros,
  b.pct,
  o.nome_acao,
  o.orgao,
  o.status,
  o.estagio_atual
from public.acao_bairros_calculo c
join public.obras o on o.id_acao = c.id_acao
left join public.acao_bairros b on b.id_acao = c.id_acao;

grant select on public.acao_bairros_lista to authenticated;

-- Ações com traçado novo ou alterado desde o último cálculo (só o servidor chama).
create or replace function public.bairros_pendentes(limite integer default 60)
returns table (id_acao text, fonte text, assinatura text)
language sql
security definer
set search_path = public
stable
as $$
  with g as (
    select t.id_acao, 'sobreposicoes'::text as fonte, md5(t.wkt) as assinatura
    from public.obras_tracado t
    union all
    select k.id_acao, 'kml'::text, md5(k.wkt)
    from public.kml_arquivos k
    where k.situacao = 'baixado' and k.wkt is not null
      and not exists (select 1 from public.obras_tracado t where t.id_acao = k.id_acao)
  )
  select g.id_acao, g.fonte, g.assinatura
  from g
  join public.obras o on o.id_acao = g.id_acao
  left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
  where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte
  order by g.id_acao
  limit greatest(1, limite);
$$;

revoke execute on function public.bairros_pendentes(integer) from public, anon, authenticated;
grant execute on function public.bairros_pendentes(integer) to service_role;

-- Números do cabeçalho da tela.
create or replace function public.bairros_resumo()
returns table (verificadas bigint, pendentes bigint, ultima timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with g as (
    select t.id_acao, 'sobreposicoes'::text as fonte, md5(t.wkt) as assinatura
    from public.obras_tracado t
    union all
    select k.id_acao, 'kml'::text, md5(k.wkt)
    from public.kml_arquivos k
    where k.situacao = 'baixado' and k.wkt is not null
      and not exists (select 1 from public.obras_tracado t where t.id_acao = k.id_acao)
  )
  select
    (select count(*) from public.acao_bairros_calculo),
    (select count(*) from g join public.obras o on o.id_acao = g.id_acao
       left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
       where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte),
    (select max(calculado_em) from public.acao_bairros_calculo)
  where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado');
$$;

revoke execute on function public.bairros_resumo() from public, anon;
grant execute on function public.bairros_resumo() to authenticated;

-- Verificação de bairros: passa a considerar também os PONTOS (e os contornos de polígonos) do KML
-- guardado, além das linhas. O ponto conta em qual bairro cai (não tem metros).
-- A assinatura de cada ação agora também muda quando o KML guardado é trocado, então depois deste
-- SQL basta clicar em "Atualizar verificação" para refazer o cálculo.

alter table public.acao_bairros_calculo
  add column if not exists pontos integer not null default 0,        -- pontos do KML considerados
  add column if not exists pontos_fora integer not null default 0;   -- pontos que não caem em nenhum bairro

alter table public.acao_bairros
  add column if not exists pontos integer not null default 0;        -- pontos do KML dentro deste bairro

drop view if exists public.acao_bairros_lista;
create view public.acao_bairros_lista
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
  o.estagio_atual,
  b.pontos,
  c.pontos_fora
from public.acao_bairros_calculo c
join public.obras o on o.id_acao = c.id_acao
left join public.acao_bairros b on b.id_acao = c.id_acao;

grant select on public.acao_bairros_lista to authenticated;

-- Traçados disponíveis e a "assinatura" de cada um (muda quando o traçado ou o KML guardado mudam).
create or replace function public.bairros_geometrias()
returns table (id_acao text, fonte text, assinatura text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id_acao, 'sobreposicoes'::text,
         md5(t.wkt) || coalesce(':' || k.baixado_em::text || ':' || coalesce(k.qtd_pontos, 0) || ':' || coalesce(k.qtd_poligonos, 0), '')
  from public.obras_tracado t
  left join public.kml_arquivos k
    on k.id_acao = t.id_acao and k.situacao = 'baixado'
   and (coalesce(k.qtd_pontos, 0) > 0 or coalesce(k.qtd_poligonos, 0) > 0)
  union all
  select k.id_acao, 'kml'::text,
         md5(coalesce(k.wkt, '')) || ':' || coalesce(k.baixado_em::text, '') || ':' || coalesce(k.qtd_pontos, 0) || ':' || coalesce(k.qtd_poligonos, 0)
  from public.kml_arquivos k
  where k.situacao = 'baixado'
    and (k.wkt is not null or coalesce(k.qtd_pontos, 0) > 0 or coalesce(k.qtd_poligonos, 0) > 0)
    and not exists (select 1 from public.obras_tracado t where t.id_acao = k.id_acao);
$$;

revoke execute on function public.bairros_geometrias() from public, anon, authenticated;

create or replace function public.bairros_pendentes(limite integer default 60)
returns table (id_acao text, fonte text, assinatura text)
language sql
security definer
set search_path = public
stable
as $$
  select g.id_acao, g.fonte, g.assinatura
  from public.bairros_geometrias() g
  join public.obras o on o.id_acao = g.id_acao
  left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
  where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte
  order by g.id_acao
  limit greatest(1, limite);
$$;

revoke execute on function public.bairros_pendentes(integer) from public, anon, authenticated;
grant execute on function public.bairros_pendentes(integer) to service_role;

create or replace function public.bairros_resumo()
returns table (verificadas bigint, pendentes bigint, ultima timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.acao_bairros_calculo),
    (select count(*)
       from public.bairros_geometrias() g
       join public.obras o on o.id_acao = g.id_acao
       left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
       where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte),
    (select max(calculado_em) from public.acao_bairros_calculo)
  where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado');
$$;

revoke execute on function public.bairros_resumo() from public, anon;
grant execute on function public.bairros_resumo() to authenticated;

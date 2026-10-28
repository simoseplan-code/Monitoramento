-- Verificação de bairros: o mapa de obras também publica os PONTOS (obras_pontos.geojson) e os
-- POLÍGONOS (obras_poligonos.geojson), além das linhas. Eles passam a ser guardados aqui (um por ação)
-- e entram na verificação, sem depender de o KML ter sido baixado do SIMO.
-- Regra de conflito: para pontos e polígonos, o do mapa vale; o do KML guardado só entra para a ação
-- que o mapa não tem. Só o servidor lê e grava (sem policy: apenas service_role).

create table if not exists public.obras_geom_extra (
  id_acao text primary key,
  pontos jsonb,        -- [[lon, lat], ...]
  poligonos jsonb,     -- [anel, ...], cada anel [[lon, lat], ...] (só o contorno externo)
  atualizado_em timestamptz not null default now()
);

alter table public.obras_geom_extra enable row level security;

-- A origem do traçado ganha "mapa": ação que tem só pontos e/ou polígonos do mapa (sem linhas).
alter table public.acao_bairros_calculo drop constraint if exists acao_bairros_calculo_fonte_check;
alter table public.acao_bairros_calculo
  add constraint acao_bairros_calculo_fonte_check check (fonte in ('sobreposicoes', 'kml', 'mapa'));

create or replace function public.bairros_geometrias()
returns table (id_acao text, fonte text, assinatura text)
language sql
security definer
set search_path = public
stable
as $$
  with ids as (
    select t.id_acao from public.obras_tracado t
    union
    select e.id_acao from public.obras_geom_extra e
    union
    select k.id_acao from public.kml_arquivos k
    where k.situacao = 'baixado' and (k.wkt is not null or coalesce(k.qtd_pontos, 0) > 0 or coalesce(k.qtd_poligonos, 0) > 0)
  )
  select
    i.id_acao,
    case when t.id_acao is not null then 'sobreposicoes' when k.wkt is not null then 'kml' else 'mapa' end::text,
    md5(coalesce(t.wkt, k.wkt, ''))
      || ':' || md5(coalesce(e.pontos::text, ''))
      || ':' || md5(coalesce(e.poligonos::text, ''))
      || ':' || coalesce(k.baixado_em::text, '')
  from ids i
  left join public.obras_tracado t on t.id_acao = i.id_acao
  left join public.obras_geom_extra e on e.id_acao = i.id_acao
  left join public.kml_arquivos k on k.id_acao = i.id_acao and k.situacao = 'baixado';
$$;

revoke execute on function public.bairros_geometrias() from public, anon, authenticated;

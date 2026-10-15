-- Base de traçados de KML das ações: cada vez que o KML de uma ação é baixado do SIMO e
-- analisado, o traçado (só as linhas) fica guardado aqui. A análise de KML compara o KML novo
-- com esta base e com os traçados do CSV de Sobreposições (obras_tracado), para avisar
-- quando duas ações têm trechos no mesmo lugar. Só o servidor grava; equipe aprovada lê.

create table if not exists public.kml_acoes (
  id_acao text primary key,
  wkt text not null,
  extensao_km numeric,
  min_lon double precision not null,
  min_lat double precision not null,
  max_lon double precision not null,
  max_lat double precision not null,
  atualizado_em timestamptz not null default now()
);

create index if not exists kml_acoes_caixa_idx on public.kml_acoes (min_lon, max_lon, min_lat, max_lat);

alter table public.kml_acoes enable row level security;

drop policy if exists "equipe aprovada le kml_acoes" on public.kml_acoes;
create policy "equipe aprovada le kml_acoes"
  on public.kml_acoes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
-- Sem policy de escrita: o painel grava pelo servidor (service_role).

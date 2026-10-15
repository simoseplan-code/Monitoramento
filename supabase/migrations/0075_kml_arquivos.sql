-- Arquivos KML guardados: o KML anexado a cada ação, baixado do SIMO uma vez e reaproveitado
-- nas próximas análises (sem baixar de novo). Também registra as ações em que o SIMO NÃO tem KML.
--
-- Regra de conflito entre ID: para comparar sobreposição, o traçado que vem da ATUALIZAÇÃO
-- do mapa (obras_tracado) sempre vale; o KML guardado só entra para o ID que a atualização
-- não tem. Só o servidor grava; equipe aprovada lê (as telas pedem só as colunas leves).

create table if not exists public.kml_arquivos (
  id_acao text primary key,
  situacao text not null check (situacao in ('baixado', 'sem_kml', 'erro')),
  nome_arquivo text,
  tamanho_bytes integer,
  kml_gzip_b64 text,            -- o arquivo (compactado), só quando situacao = 'baixado'
  wkt text,                     -- só as linhas, para comparar com outras ações
  extensao_km numeric,
  qtd_pontos integer,
  qtd_linhas integer,
  qtd_poligonos integer,
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  mensagem text,
  verificado_em timestamptz not null default now(),
  baixado_em timestamptz,
  baixado_por uuid references public.profiles(id)
);

create index if not exists kml_arquivos_situacao_idx on public.kml_arquivos (situacao, verificado_em desc);
create index if not exists kml_arquivos_caixa_idx on public.kml_arquivos (min_lon, max_lon, min_lat, max_lat);

alter table public.kml_arquivos enable row level security;

drop policy if exists "equipe aprovada le kml_arquivos" on public.kml_arquivos;
create policy "equipe aprovada le kml_arquivos"
  on public.kml_arquivos for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
-- Sem policy de escrita: o painel grava pelo servidor (service_role).

-- Números do painel "Arquivos KML".
create or replace function public.kml_arquivos_resumo()
returns table (baixados bigint, sem_kml bigint, com_erro bigint, total_acoes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where k.situacao = 'baixado'),
    count(*) filter (where k.situacao = 'sem_kml'),
    count(*) filter (where k.situacao = 'erro'),
    (select count(*) from public.obras)
  from public.kml_arquivos k
  where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado');
$$;

revoke execute on function public.kml_arquivos_resumo() from public, anon;
grant execute on function public.kml_arquivos_resumo() to authenticated;

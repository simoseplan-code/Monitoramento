-- Caixa (bbox) de cada traçado, para a análise de KML buscar só as ações que estão perto,
-- em vez de ler todos os traçados a cada análise. Preenchida quando o painel atualiza as
-- sobreposições direto do mapa (linhas antigas ficam sem caixa e continuam sendo lidas).
alter table public.obras_tracado
  add column if not exists min_lon double precision,
  add column if not exists min_lat double precision,
  add column if not exists max_lon double precision,
  add column if not exists max_lat double precision;

create index if not exists obras_tracado_caixa_idx on public.obras_tracado (min_lon, max_lon, min_lat, max_lat);

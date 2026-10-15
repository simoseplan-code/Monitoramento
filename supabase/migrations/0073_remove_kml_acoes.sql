-- A comparação de KML com a base passou a ser pontual (não grava nada): a tabela de KMLs
-- analisados (migration 0072) não é mais usada.
drop table if exists public.kml_acoes;

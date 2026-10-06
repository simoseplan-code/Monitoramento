-- Ao marcar um local como "Solucionado" a pessoa descreve COMO foi solucionado; o
-- texto fica ao lado do problema (observação) na aba Solucionado. Parte 1: coluna.
alter table public.sobreposicoes add column if not exists solucao text;

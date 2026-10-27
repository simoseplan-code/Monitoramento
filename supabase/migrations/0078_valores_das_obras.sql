-- Valores e classificação das obras, vindos do relatório do SIMO (colunas VALOR ORIGINAL,
-- VALOR TOTAL e CLASSIFICAÇÃO). Servem à tela "Análise de obras concluídas":
--   valor_original : valor contratado
--   valor_total    : valor ao final da obra (com os aditivos)
--   o aditivo é a diferença (valor_total - valor_original), calculada no painel.
-- As colunas ficam vazias até a próxima sincronização com o SIMO.

alter table public.obras
  add column if not exists valor_original numeric(18, 2),
  add column if not exists valor_total numeric(18, 2),
  add column if not exists classificacao text;

-- Corrige a fila de Unidade/Quantidade sumindo com ações que têm
-- Unidade de Medida vazia mas cuja Tipologia não está mapeada e sem
-- palavra-chave reconhecível no texto — antes essas eram descartadas
-- silenciosamente (sync.ts fazia `if (!sugestao) continue`). Achado
-- pelo usuário comparando a fila (999, badge) com a contagem real de
-- vazias na base (2658) — só 726 estavam na fila.
alter table public.obras_unidade_sugestao alter column unidade_sugerida drop not null;

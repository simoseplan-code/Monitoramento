-- O SIMO responde HTTP 200 com aviso/erro de outra aba da ação e grava a
-- Unidade/Quantidade assim mesmo. Esses casos eram registrados como
-- "A verificar (HTTP 200)" (falha). Passam a constar como sucesso, também
-- no histórico (gravações, produtividade e desempenho). HTTP diferente de 200
-- e erros de conexão/somente leitura continuam como falha.

-- 1) Sugestões cuja última tentativa foi esse caso: marca como gravadas.
update public.obras_unidade_sugestao s
set aplicado_em = u.executado_em,
    aplicado_com_sucesso = true
from (
  select distinct on (l.id_acao) l.id_acao, l.resultado, l.executado_em
  from public.obras_unidade_log l
  order by l.id_acao, l.executado_em desc
) u
where u.id_acao = s.id_acao
  and s.aprovado
  and s.aplicado_em is null
  and u.resultado like 'A verificar (HTTP 200)%';

-- 2) Histórico de gravações.
update public.obras_unidade_log
set resultado = 'Sucesso (HTTP 200 com aviso do SIMO — gravou mesmo assim)'
where resultado like 'A verificar (HTTP 200)%';

-- 3) Registro de atividades (desempenho da equipe).
update public.analises_log
set acao = 'gravado_no_simo'
where modulo = 'unidade_quantidade'
  and acao = 'falha_gravacao'
  and detalhe like 'A verificar (HTTP 200)%';

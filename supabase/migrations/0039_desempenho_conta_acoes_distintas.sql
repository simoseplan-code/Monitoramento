-- O dashboard contava CADA CLIQUE como uma análise. Em Novas Ações cada ação
-- tem 3 itens de checklist (+ concluir), então 1 ação analisada virava até 4
-- "análises". Agora conta AÇÕES DISTINTAS: cada (pessoa, tela, ação/local)
-- vale 1, no dia em que a pessoa mexeu nela pela primeira vez. Desfazer/
-- reabrir não conta; falhas de gravação seguem contadas à parte (por evento).

create or replace function public.desempenho_agregado(
  data_de date default null,
  data_ate date default null
)
returns table (
  dia date,
  usuario_id uuid,
  usuario_nome text,
  modulo text,
  acao text,
  retroativo boolean,
  total bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with eventos as (
    select
      a.usuario_id,
      a.modulo,
      a.referencia,
      a.acao,
      (a.detalhe = 'retroativo') as retroativo,
      a.criado_em,
      (a.criado_em at time zone 'America/Fortaleza')::date as dia
    from public.analises_log a
    where public.is_admin_aprovado(auth.uid())
      and (data_de is null or (a.criado_em at time zone 'America/Fortaleza')::date >= data_de)
      and (data_ate is null or (a.criado_em at time zone 'America/Fortaleza')::date <= data_ate)
  ),
  produtivos as (
    select distinct on (e.usuario_id, e.modulo, e.referencia)
      e.dia, e.usuario_id, e.modulo, e.acao, e.retroativo
    from eventos e
    where e.acao not in ('pendente', 'reaberto', 'desaprovado', 'falha_gravacao', 'falha_vinculacao')
    order by e.usuario_id, e.modulo, e.referencia, e.criado_em
  ),
  falhas as (
    select e.dia, e.usuario_id, e.modulo, e.acao, e.retroativo
    from eventos e
    where e.acao in ('falha_gravacao', 'falha_vinculacao')
  ),
  todos as (
    select * from produtivos
    union all
    select * from falhas
  )
  select
    t.dia,
    t.usuario_id,
    coalesce(p.nome, 'Desconhecido') as usuario_nome,
    t.modulo,
    t.acao,
    t.retroativo,
    count(*) as total
  from todos t
  left join public.profiles p on p.id = t.usuario_id
  group by 1, 2, 3, 4, 5, 6;
$$;

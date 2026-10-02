-- Base do dashboard de desempenho (só admin): analises_log agregado por
-- dia, pessoa, módulo e ação. O gate de admin fica dentro da função porque
-- security definer ignora a RLS da tabela.
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
  select
    (a.criado_em at time zone 'America/Fortaleza')::date as dia,
    a.usuario_id,
    coalesce(p.nome, 'Desconhecido') as usuario_nome,
    a.modulo,
    a.acao,
    (a.detalhe = 'retroativo') as retroativo,
    count(*) as total
  from public.analises_log a
  left join public.profiles p on p.id = a.usuario_id
  where public.is_admin_aprovado(auth.uid())
    and (data_de is null or (a.criado_em at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (a.criado_em at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 2, 3, 4, 5, 6;
$$;

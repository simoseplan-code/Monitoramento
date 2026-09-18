-- "Concluir análise" é um passo final, separado dos 4 checks — só faz
-- sentido depois que os 4 já estão confirmados, e é ele que de fato
-- tira o card da lista padrão (os checks sozinhos não escondem mais).
alter table public.obras_revisao
  add column concluido boolean not null default false,
  add column concluido_em timestamptz,
  add column concluido_por uuid references public.profiles(id);

-- Atualiza a contagem de pendências pra considerar "concluido", não
-- mais os 4 checks isolados (uma ação com os 4 confirmados mas ainda
-- sem "Concluir análise" continua contando como pendente).
create or replace function public.contar_novas_acoes_pendentes(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  left join public.obras_revisao r on r.id_acao = o.id_acao
  where o.data_criacao >= data_inicio
    and o.data_criacao <= (current_date - interval '1 day')
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and coalesce(r.concluido, false) = false;
$$;

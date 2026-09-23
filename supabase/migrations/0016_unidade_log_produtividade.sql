-- Resumo de produtividade por pessoa em cima de obras_unidade_log —
-- pedido explícito do usuário: manter histórico de quem gravou o quê
-- no SIMO pra poder analisar depois.
create or replace function public.unidade_log_produtividade()
returns table (
  executado_por uuid,
  nome text,
  total bigint,
  sucessos bigint,
  ultima_gravacao timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  -- security definer ignora a RLS de obras_unidade_log (só admin lê) —
  -- por isso o gate explícito abaixo: sem ele, qualquer usuário
  -- autenticado veria produtividade de gravação de todo mundo.
  select
    l.executado_por,
    coalesce(p.nome, 'Desconhecido'),
    count(*),
    count(*) filter (where l.resultado ilike 'sucesso%'),
    max(l.executado_em)
  from public.obras_unidade_log l
  left join public.profiles p on p.id = l.executado_por
  where public.is_admin_aprovado(auth.uid())
  group by l.executado_por, p.nome
  order by count(*) desc;
$$;

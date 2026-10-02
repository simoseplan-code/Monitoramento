-- Responsável pela análise de Sobreposições: quem registra a primeira decisão
-- (sem problema / com problema) vira o responsável; depois só ele ou um admin
-- mexe naquele local. Tudo fica no nome do responsável. Só admin troca.

alter table public.sobreposicoes
  add column if not exists responsavel_id uuid references public.profiles(id);

update public.sobreposicoes
set responsavel_id = revisado_por
where responsavel_id is null and revisado_por is not null and status <> 'pendente';

drop policy if exists "equipe aprovada atualiza sobreposicoes" on public.sobreposicoes;

create policy "responsavel ou admin atualiza sobreposicoes"
  on public.sobreposicoes for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
    and (responsavel_id is null or responsavel_id = auth.uid() or public.is_admin_aprovado(auth.uid()))
  );

-- Situação por pessoa no dashboard de desempenho (só admin):
--   problema = analisou e achou problema (fica pra verificação posterior)
--   ok       = sem problema (não se configura como sobreposição)
create or replace function public.desempenho_sobreposicoes(
  data_de date default null,
  data_ate date default null
)
returns table (usuario_id uuid, situacao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(s.responsavel_id, s.revisado_por) as usuario_id,
    s.status as situacao,
    count(*) as total
  from public.sobreposicoes s
  where public.is_admin_aprovado(auth.uid())
    and s.status in ('ok', 'problema')
    and coalesce(s.responsavel_id, s.revisado_por) is not null
    and coalesce(s.observacao, '') not like 'Carregado automaticamente%'
    and (data_de is null or (coalesce(s.revisado_em, s.atualizado_em) at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (coalesce(s.revisado_em, s.atualizado_em) at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 2;
$$;

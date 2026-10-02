-- Novo estado "solucionado" em Sobreposições: um local "com problema" pode ser
-- marcado como solucionado por QUALQUER pessoa (grava quem solucionou e
-- quando). "Voltar com problema" desgrava o solucionador e o local volta pro
-- responsável que estava (responsavel_id nunca é mexido nesse fluxo).

alter table public.sobreposicoes
  add column if not exists solucionado_por uuid references public.profiles(id),
  add column if not exists solucionado_em timestamptz;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.sobreposicoes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.sobreposicoes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.sobreposicoes
  add constraint sobreposicoes_status_check check (status in ('pendente', 'ok', 'problema', 'solucionado'));

-- Contagens das abas ganham "solucionado".
drop function if exists public.sobreposicoes_contagens(text, int, boolean);

create or replace function public.sobreposicoes_contagens(
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false
)
returns table (pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where s.status = 'pendente'),
    count(*) filter (where s.status = 'ok'),
    count(*) filter (where s.status = 'problema'),
    count(*) filter (where s.status = 'solucionado')
  from public.sobreposicoes s
  where (
      orgao_filtro is null or orgao_filtro = '' or exists (
        select 1 from jsonb_array_elements(s.obras) elem
        where trim(elem.value ->> 'orgao') = orgao_filtro
      )
    )
    and (
      ano_filtro is null or exists (
        select 1
        from jsonb_array_elements(s.obras) elem
        join public.obras o on o.id_acao = elem.value ->> 'id'
        where extract(year from o.data_criacao)::int = ano_filtro
      )
    )
    and (
      not ocultar_estrada_vicinal or exists (
        select 1
        from jsonb_array_elements(s.obras) elem
        left join public.obras o on o.id_acao = elem.value ->> 'id'
        where upper(trim(coalesce(o.tipologia, ''))) is distinct from 'ESTRADA VICINAL'
      )
    );
$$;

-- Desempenho: o que cada pessoa analisou e quem solucionou.
--   ok / problema    = análises da pessoa como responsável (problema = em aberto)
--   solucionado_resp = problemas que ela achou e que depois foram solucionados
--   solucionou       = problemas que ELA marcou como solucionado
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
    case s.status when 'solucionado' then 'solucionado_resp' else s.status end as situacao,
    count(*) as total
  from public.sobreposicoes s
  where public.is_admin_aprovado(auth.uid())
    and s.status in ('ok', 'problema', 'solucionado')
    and coalesce(s.responsavel_id, s.revisado_por) is not null
    and coalesce(s.observacao, '') not like 'Carregado automaticamente%'
    and (data_de is null or (coalesce(s.revisado_em, s.atualizado_em) at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (coalesce(s.revisado_em, s.atualizado_em) at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 2

  union all

  select
    s.solucionado_por,
    'solucionou',
    count(*)
  from public.sobreposicoes s
  where public.is_admin_aprovado(auth.uid())
    and s.status = 'solucionado'
    and s.solucionado_por is not null
    and (data_de is null or (s.solucionado_em at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (s.solucionado_em at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1;
$$;

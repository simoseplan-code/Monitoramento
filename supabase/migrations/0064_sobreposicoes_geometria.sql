-- Mapa da sobreposição: o CSV do Mapa de Obras passou a trazer a geometria.
--   sobreposicoes.geom_sobreposta : trecho(s) sobreposto(s) do local, lista de WKT
--   obras_tracado                 : traçado completo de cada obra, um por ação
-- Mesmo acesso de Sobreposições: só admin e chefe.

alter table public.sobreposicoes
  add column if not exists geom_sobreposta jsonb;

create table if not exists public.obras_tracado (
  id_acao text primary key,
  wkt text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.obras_tracado enable row level security;

drop policy if exists "supervisor le tracados" on public.obras_tracado;
create policy "supervisor le tracados"
  on public.obras_tracado for select
  using (public.is_admin_aprovado(auth.uid()));

drop policy if exists "supervisor insere tracados" on public.obras_tracado;
create policy "supervisor insere tracados"
  on public.obras_tracado for insert
  with check (public.is_admin_aprovado(auth.uid()));

drop policy if exists "supervisor atualiza tracados" on public.obras_tracado;
create policy "supervisor atualiza tracados"
  on public.obras_tracado for update
  using (public.is_admin_aprovado(auth.uid()));

grant select, insert, update on public.obras_tracado to authenticated;

-- Grava a geometria de vários locais de uma vez (o importador manda em lotes).
create or replace function public.sobreposicoes_salvar_geometria(dados jsonb)
returns int
language sql
security invoker
set search_path = public
as $$
  with alterados as (
    update public.sobreposicoes s
    set geom_sobreposta = x.geoms
    from jsonb_to_recordset(dados) as x(chave text, geoms jsonb)
    where s.chave_local = x.chave
    returning 1
  )
  select count(*)::int from alterados;
$$;

revoke execute on function public.sobreposicoes_salvar_geometria(jsonb) from public, anon;
grant execute on function public.sobreposicoes_salvar_geometria(jsonb) to authenticated;

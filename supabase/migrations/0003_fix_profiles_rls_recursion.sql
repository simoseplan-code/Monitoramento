-- Corrige "infinite recursion detected in policy for relation profiles".
-- As policies de admin consultavam a própria tabela profiles dentro do
-- USING, o que reavalia a RLS de novo (recursão). A correção padrão do
-- Supabase é isolar essa checagem numa função security definer, que
-- roda com privilégio do dono (ignora RLS internamente) e quebra o loop.

create or replace function public.is_admin_aprovado(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and is_admin and status = 'aprovado'
  );
$$;

drop policy if exists "admin ve todos os perfis" on public.profiles;
create policy "admin ve todos os perfis"
  on public.profiles for select
  using (public.is_admin_aprovado(auth.uid()));

drop policy if exists "admin atualiza perfis" on public.profiles;
create policy "admin atualiza perfis"
  on public.profiles for update
  using (public.is_admin_aprovado(auth.uid()));

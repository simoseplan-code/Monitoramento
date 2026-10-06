-- Níveis de acesso: admin, chefe e equipe.
--   admin  : vê e faz tudo, e é o único que altera o acesso das pessoas.
--   chefe  : vê e faz tudo igual ao admin, MENOS alterar acesso (aprovar/rejeitar
--            cadastro e mudar a função de alguém).
--   equipe : acesso padrão às análises (sem Sobreposições, sem Desempenho/Relatórios/Equipe).
--
-- "is_admin" continua existindo e significa "supervisor" (admin ou chefe): é ele que
-- libera Desempenho, Relatórios, Administração etc. Agora ele é calculado a partir da
-- coluna "papel" e ninguém consegue mudar nenhum dos dois por fora do painel.

alter table public.profiles
  add column if not exists papel text not null default 'equipe'
  check (papel in ('admin', 'chefe', 'equipe'));

-- Quem já é admin continua admin.
update public.profiles set papel = 'admin' where is_admin and papel = 'equipe';

create or replace function public.proteger_papel_e_sincronizar_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mudar função, status ou is_admin só quem é admin aprovado (ou o servidor, sem
  -- sessão de usuário). Sem isto um chefe poderia se promover direto pela API.
  if tg_op = 'UPDATE'
     and (new.papel is distinct from old.papel or new.status is distinct from old.status or new.is_admin is distinct from old.is_admin)
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.papel = 'admin' and p.status = 'aprovado'
     )
  then
    raise exception 'Só administrador altera acessos.';
  end if;

  new.is_admin := (new.papel in ('admin', 'chefe'));
  return new;
end;
$$;

drop trigger if exists profiles_papel_guard on public.profiles;
create trigger profiles_papel_guard
  before insert or update on public.profiles
  for each row execute function public.proteger_papel_e_sincronizar_admin();

-- Chefe lê todos os perfis (precisa ver a equipe), mas só o administrador ALTERA perfis.
create or replace function public.eh_administrador(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and papel = 'admin' and status = 'aprovado'
  );
$$;

drop policy if exists "admin atualiza perfis" on public.profiles;
create policy "admin atualiza perfis"
  on public.profiles for update
  using (public.eh_administrador(auth.uid()));

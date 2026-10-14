-- Configuração de TD: ações "mãe" (identificadas pelo ID da ação) e as ações "filhas"
-- que ficam dentro de cada uma. Começa vazio; quem monta é o painel.
-- As tabelas guardam só os IDs (sem FK para obras), como as outras análises: se a ação
-- some do SIMO numa sincronização, a configuração continua. Acesso: admin e chefe.

create table if not exists public.td_acoes_mae (
  id_acao text primary key,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

-- Uma ação filha pertence a uma única mãe (por isso o ID da filha é a chave).
create table if not exists public.td_acoes_filha (
  id_acao text primary key,
  id_acao_mae text not null references public.td_acoes_mae(id_acao) on delete cascade,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

create index if not exists td_acoes_filha_mae_idx on public.td_acoes_filha (id_acao_mae);

alter table public.td_acoes_mae enable row level security;
alter table public.td_acoes_filha enable row level security;

drop policy if exists "supervisor le td mae" on public.td_acoes_mae;
create policy "supervisor le td mae" on public.td_acoes_mae for select using (public.is_admin_aprovado(auth.uid()));
drop policy if exists "supervisor insere td mae" on public.td_acoes_mae;
create policy "supervisor insere td mae" on public.td_acoes_mae for insert with check (public.is_admin_aprovado(auth.uid()));
drop policy if exists "supervisor apaga td mae" on public.td_acoes_mae;
create policy "supervisor apaga td mae" on public.td_acoes_mae for delete using (public.is_admin_aprovado(auth.uid()));

drop policy if exists "supervisor le td filha" on public.td_acoes_filha;
create policy "supervisor le td filha" on public.td_acoes_filha for select using (public.is_admin_aprovado(auth.uid()));
drop policy if exists "supervisor insere td filha" on public.td_acoes_filha;
create policy "supervisor insere td filha" on public.td_acoes_filha for insert with check (public.is_admin_aprovado(auth.uid()));
drop policy if exists "supervisor apaga td filha" on public.td_acoes_filha;
create policy "supervisor apaga td filha" on public.td_acoes_filha for delete using (public.is_admin_aprovado(auth.uid()));

grant select, insert, delete on public.td_acoes_mae to authenticated;
grant select, insert, delete on public.td_acoes_filha to authenticated;

-- Uma ação não pode ser mãe e filha ao mesmo tempo (vale também fora do painel).
create or replace function public.td_valida_hierarquia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'td_acoes_mae' then
    if exists (select 1 from public.td_acoes_filha where id_acao = new.id_acao) then
      raise exception 'A ação % já é filha de outra ação mãe.', new.id_acao;
    end if;
  else
    if new.id_acao = new.id_acao_mae then
      raise exception 'Uma ação não pode ser filha dela mesma.';
    end if;
    if exists (select 1 from public.td_acoes_mae where id_acao = new.id_acao) then
      raise exception 'A ação % já é uma ação mãe.', new.id_acao;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists td_mae_valida on public.td_acoes_mae;
create trigger td_mae_valida before insert on public.td_acoes_mae
  for each row execute function public.td_valida_hierarquia();

drop trigger if exists td_filha_valida on public.td_acoes_filha;
create trigger td_filha_valida before insert on public.td_acoes_filha
  for each row execute function public.td_valida_hierarquia();

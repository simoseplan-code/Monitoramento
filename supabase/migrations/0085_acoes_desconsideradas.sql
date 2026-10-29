-- Ações não vinculadas ao SIAFE: lista de IDs que a equipe decidiu DESCONSIDERAR da análise.
-- A lista é única e compartilhada: quem desconsidera um ID, tira para todos. Qualquer pessoa aprovada
-- pode incluir e devolver IDs; fica registrado quem pôs e quando.

create table if not exists public.acoes_desconsideradas (
  id_acao text primary key,
  desconsiderada_em timestamptz not null default now(),
  desconsiderada_por uuid references public.profiles(id) on delete set null,
  por_nome text
);

alter table public.acoes_desconsideradas enable row level security;

drop policy if exists "equipe aprovada le acoes_desconsideradas" on public.acoes_desconsideradas;
create policy "equipe aprovada le acoes_desconsideradas"
  on public.acoes_desconsideradas for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada inclui acoes_desconsideradas" on public.acoes_desconsideradas;
create policy "equipe aprovada inclui acoes_desconsideradas"
  on public.acoes_desconsideradas for insert
  with check (
    desconsiderada_por = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
  );

drop policy if exists "equipe aprovada devolve acoes_desconsideradas" on public.acoes_desconsideradas;
create policy "equipe aprovada devolve acoes_desconsideradas"
  on public.acoes_desconsideradas for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

grant select, insert, delete on public.acoes_desconsideradas to authenticated;

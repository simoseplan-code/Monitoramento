-- Configuração de TD (ações mãe e filhas): passa a ser aberta a toda a equipe aprovada
-- (antes só admin e chefe). Troca as regras de acesso das duas tabelas.

drop policy if exists "supervisor le td mae" on public.td_acoes_mae;
drop policy if exists "supervisor insere td mae" on public.td_acoes_mae;
drop policy if exists "supervisor apaga td mae" on public.td_acoes_mae;
drop policy if exists "supervisor le td filha" on public.td_acoes_filha;
drop policy if exists "supervisor insere td filha" on public.td_acoes_filha;
drop policy if exists "supervisor apaga td filha" on public.td_acoes_filha;

drop policy if exists "equipe aprovada le td mae" on public.td_acoes_mae;
create policy "equipe aprovada le td mae" on public.td_acoes_mae for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
drop policy if exists "equipe aprovada insere td mae" on public.td_acoes_mae;
create policy "equipe aprovada insere td mae" on public.td_acoes_mae for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
drop policy if exists "equipe aprovada apaga td mae" on public.td_acoes_mae;
create policy "equipe aprovada apaga td mae" on public.td_acoes_mae for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada le td filha" on public.td_acoes_filha;
create policy "equipe aprovada le td filha" on public.td_acoes_filha for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
drop policy if exists "equipe aprovada insere td filha" on public.td_acoes_filha;
create policy "equipe aprovada insere td filha" on public.td_acoes_filha for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
drop policy if exists "equipe aprovada apaga td filha" on public.td_acoes_filha;
create policy "equipe aprovada apaga td filha" on public.td_acoes_filha for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

-- Responsável pela análise de Novas Ações: quem começa a analisar uma ação
-- passa a ser o único (além de admin) que pode mexer nela. Tudo que for
-- registrado nela, inclusive edição feita por admin, fica no nome do
-- responsável. Só admin troca o responsável.

alter table public.obras_revisao
  add column if not exists responsavel_id uuid references public.profiles(id);

-- Quem já analisou antes disso vira o responsável.
update public.obras_revisao
set responsavel_id = coalesce(revisado_por, concluido_por)
where responsavel_id is null and coalesce(revisado_por, concluido_por) is not null;

-- Trava no banco também (não só na tela/rota): só o responsável ou um admin
-- grava; sem responsável ainda, qualquer um aprovado pode começar.
drop policy if exists "equipe aprovada insere revisao" on public.obras_revisao;
drop policy if exists "equipe aprovada atualiza revisao" on public.obras_revisao;

create policy "equipe aprovada insere revisao"
  on public.obras_revisao for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
    and (responsavel_id is null or responsavel_id = auth.uid() or public.is_admin_aprovado(auth.uid()))
  );

create policy "responsavel ou admin atualiza revisao"
  on public.obras_revisao for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
    and (responsavel_id is null or responsavel_id = auth.uid() or public.is_admin_aprovado(auth.uid()))
  );

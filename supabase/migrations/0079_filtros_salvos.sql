-- Filtro gravado por pessoa e por tela: quem grava o filtro (ex.: Análise de obras concluídas)
-- volta a encontrá-lo do mesmo jeito ao sair e entrar de novo, em qualquer computador.
create table if not exists public.filtros_salvos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tela text not null,
  estado jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, tela)
);

alter table public.filtros_salvos enable row level security;

drop policy if exists "cada pessoa le o proprio filtro" on public.filtros_salvos;
create policy "cada pessoa le o proprio filtro" on public.filtros_salvos for select using (usuario_id = auth.uid());
drop policy if exists "cada pessoa grava o proprio filtro" on public.filtros_salvos;
create policy "cada pessoa grava o proprio filtro" on public.filtros_salvos for insert with check (usuario_id = auth.uid());
drop policy if exists "cada pessoa troca o proprio filtro" on public.filtros_salvos;
create policy "cada pessoa troca o proprio filtro" on public.filtros_salvos for update using (usuario_id = auth.uid());
drop policy if exists "cada pessoa apaga o proprio filtro" on public.filtros_salvos;
create policy "cada pessoa apaga o proprio filtro" on public.filtros_salvos for delete using (usuario_id = auth.uid());

grant select, insert, update, delete on public.filtros_salvos to authenticated;

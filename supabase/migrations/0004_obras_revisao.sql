-- Checklist manual de revisão de ações novas — separado da tabela
-- "obras" (que é sobrescrita pelo sync do SIMO) pra nunca perder o que
-- a equipe já conferiu.
create table public.obras_revisao (
  id_acao text primary key references public.obras(id_acao) on delete cascade,
  kml_anexado boolean not null default false,
  sem_duplicacao boolean not null default false,
  trecho_unico boolean not null default false,
  documentos_obrigatorios boolean not null default false,
  revisado_por uuid references public.profiles(id),
  revisado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.obras_revisao enable row level security;

create policy "equipe aprovada le revisao"
  on public.obras_revisao for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada insere revisao"
  on public.obras_revisao for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada atualiza revisao"
  on public.obras_revisao for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

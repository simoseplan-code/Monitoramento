-- Revisão de sobreposições de trechos, importadas do CSV gerado pelo
-- Mapa de Obras (ferramenta de detecção geométrica de duplicidade).
-- "chave_local" é o identificador ESTÁVEL de cada local (ids das obras
-- envolvidas, ordenados e concatenados) — não muda entre exportações,
-- então uma reimportação sabe distinguir "local já visto" de "local novo".
create table public.sobreposicoes (
  chave_local text primary key,
  obras jsonb not null default '[]'::jsonb,
  qtd_obras int not null default 0,
  extensao_m numeric,
  tolerancia_m int,
  qtd_segmentos int,
  lat_inicio numeric,
  lon_inicio numeric,
  lat_fim numeric,
  lon_fim numeric,
  status text not null default 'pendente' check (status in ('pendente', 'ok', 'problema')),
  observacao text,
  revisado_por uuid references public.profiles(id),
  revisado_em timestamptz,
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index sobreposicoes_status_idx on public.sobreposicoes (status);

alter table public.sobreposicoes enable row level security;

create policy "equipe aprovada le sobreposicoes"
  on public.sobreposicoes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada insere sobreposicoes"
  on public.sobreposicoes for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada atualiza sobreposicoes"
  on public.sobreposicoes for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

-- Conta direto no Postgres pra badge do menu lateral, no mesmo padrão de contar_novas_acoes_pendentes.
create function public.contar_sobreposicoes_pendentes()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.sobreposicoes where status = 'pendente';
$$;

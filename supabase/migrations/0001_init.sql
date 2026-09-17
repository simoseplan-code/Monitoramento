-- ============================================================
-- Monitoramento de Obras — schema inicial
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto
-- lqvxsxlemdvedxhfnnwv), de uma vez só, uma única vez.
-- ============================================================

-- ── PROFILES (cadastro da equipe, aprovação manual) ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  cargo text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  is_admin boolean not null default false,
  locked_until timestamptz,
  failed_login_attempts int not null default 0,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "usuario ve o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin ve todos os perfis"
  on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'aprovado'));

create policy "admin atualiza perfis"
  on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'aprovado'));

-- Cria a linha em profiles automaticamente quando alguém se cadastra
-- (auth.users), já como "pendente" — só o admin muda pra "aprovado".
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── OBRAS (dados sincronizados do SIMO) ─────────────────────
-- Colunas conhecidas hoje viram coluna de verdade (fácil de filtrar/
-- ordenar); qualquer coluna nova que o SIMO adicionar no relatório cai
-- em "extra" (jsonb) até decidirmos promovê-la — o sync nunca quebra
-- por causa de coluna nova.
create table public.obras (
  id_acao text primary key,
  nome_acao text not null,
  numero_automatico text,
  numero_siafe text,
  orgao text,
  status text,
  data_criacao date,
  estagio_atual text,
  percentual_execucao numeric,
  acao_conveniada text,
  tipo_outros_documentos text,
  extra jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

create index obras_status_idx on public.obras (status);
create index obras_orgao_idx on public.obras (orgao);
create index obras_numero_siafe_idx on public.obras (numero_siafe);

alter table public.obras enable row level security;

create policy "equipe aprovada le obras"
  on public.obras for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

-- Nenhuma policy de insert/update/delete para usuários comuns — só o
-- service_role (usado pela rota /api/cron/sync-simo) escreve nesta tabela.

-- ── HISTÓRICO (retrato diário, igual à aba "Histórico" da planilha) ──
create table public.obras_historico (
  id bigint generated always as identity primary key,
  registrado_em timestamptz not null default now(),
  total int not null,
  vinculadas int not null,
  pendentes int not null,
  dado_incorreto int not null
);

alter table public.obras_historico enable row level security;

create policy "equipe aprovada le historico"
  on public.obras_historico for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

-- ── LOG DE SYNC (cada execução do cron, sucesso ou erro) ────
create table public.sync_log (
  id bigint generated always as identity primary key,
  executado_em timestamptz not null default now(),
  sucesso boolean not null,
  linhas_processadas int,
  mensagem text
);

alter table public.sync_log enable row level security;

create policy "admin le sync_log"
  on public.sync_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'aprovado'));

-- ── RATE LIMIT + LOCKOUT (mesmo padrão da Frente Limma) ─────
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  chave text not null,
  criado_em timestamptz not null default now()
);

create index rate_limit_hits_chave_idx on public.rate_limit_hits (chave, criado_em);

alter table public.rate_limit_hits enable row level security;
-- Sem nenhuma policy: deny-by-default. Só o service_role acessa.

create function public.check_rate_limit(p_chave text, p_limite int, p_janela_minutos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem int;
begin
  delete from public.rate_limit_hits
  where chave = p_chave and criado_em < now() - (p_janela_minutos || ' minutes')::interval;

  select count(*) into v_contagem from public.rate_limit_hits where chave = p_chave;

  if v_contagem >= p_limite then
    return false;
  end if;

  insert into public.rate_limit_hits (chave) values (p_chave);
  return true;
end;
$$;

-- A limpeza periódica do rate_limit_hits (pg_cron) está no arquivo
-- 0002_pg_cron.sql — rode-o depois de ativar a extensão pg_cron em
-- Database → Extensions.

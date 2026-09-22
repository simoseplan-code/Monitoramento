-- Sugestão de Unidade de Medida / Quantidade — porta da planilha
-- "Sugestão Unidade/Quantidade" pro app. Ver plano em
-- C:\Users\tom.morais\.claude\plans\breezy-riding-hickey.md.

-- ── Novas colunas sincronizadas do SIMO ─────────────────────
alter table public.obras
  add column tipologia text,
  add column unidade_medida text,
  add column quantidade numeric,
  add column descricao_acao text;

-- ── SUGESTÃO DE UNIDADE/QUANTIDADE (calculada pelo sync) ────
-- 1:1 com obras — só tem linha pra ação com unidade vazia ou
-- divergente da sugestão (igual a aba da planilha só lista essas).
create table public.obras_unidade_sugestao (
  id_acao text primary key references public.obras(id_acao) on delete cascade,
  unidade_atual text,
  quantidade_atual text,
  unidade_sugerida text not null,
  quantidade_sugerida text,
  sem_quantidade boolean not null default false,
  confianca text not null check (confianca in ('alta', 'baixa')),
  aviso_tipologia boolean not null default false,
  motivo text not null,
  aprovado boolean not null default false,
  aprovado_por uuid references public.profiles(id),
  aprovado_em timestamptz,
  aplicado_em timestamptz,
  aplicado_com_sucesso boolean,
  atualizado_em timestamptz not null default now()
);

create index obras_unidade_sugestao_atualizado_idx on public.obras_unidade_sugestao (atualizado_em);

alter table public.obras_unidade_sugestao enable row level security;

create policy "equipe aprovada le sugestao unidade"
  on public.obras_unidade_sugestao for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create policy "equipe aprovada aprova sugestao unidade"
  on public.obras_unidade_sugestao for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

-- Nenhuma policy de insert/delete pra usuários comuns — só o
-- service_role (sync) escreve essas linhas.

-- ── LOG DE GRAVAÇÃO NO SIMO (auditoria) ─────────────────────
create table public.obras_unidade_log (
  id bigint generated always as identity primary key,
  id_acao text not null,
  nome_acao text,
  unidade_antiga text,
  unidade_nova text,
  quantidade_antiga text,
  quantidade_nova text,
  http_code int,
  resultado text not null,
  resposta_bruta text,
  executado_por uuid references public.profiles(id),
  executado_em timestamptz not null default now()
);

alter table public.obras_unidade_log enable row level security;

create policy "admin le log unidade"
  on public.obras_unidade_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'aprovado'));

-- ── RPCs de listagem paginada (mesmo padrão de novas_acoes_lista) ──
create or replace function public.unidade_sugestao_lista(
  busca text default null,
  orgao_filtro text default null,
  confianca_filtro text default null,
  so_pendentes_aprovacao boolean default true,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  tipologia text,
  unidade_atual text,
  quantidade_atual text,
  unidade_sugerida text,
  quantidade_sugerida text,
  sem_quantidade boolean,
  confianca text,
  aviso_tipologia boolean,
  motivo text,
  aprovado boolean,
  aplicado_em timestamptz,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.tipologia,
      s.unidade_atual,
      s.quantidade_atual,
      s.unidade_sugerida,
      s.quantidade_sugerida,
      s.sem_quantidade,
      s.confianca,
      s.aviso_tipologia,
      s.motivo,
      s.aprovado,
      s.aplicado_em
    from public.obras_unidade_sugestao s
    join public.obras o on o.id_acao = s.id_acao
    where (not so_pendentes_aprovacao or (s.aprovado = false and s.aplicado_em is null))
      and (confianca_filtro is null or confianca_filtro = '' or s.confianca = confianca_filtro)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select base.*, count(*) over() as total_geral
  from base
  order by (aprovado = false and aplicado_em is null) desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.unidade_sugestao_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_unidade_sugestao s
  join public.obras o on o.id_acao = s.id_acao
  where o.orgao is not null
  order by o.orgao;
$$;

create or replace function public.contar_sugestoes_unidade_pendentes()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_unidade_sugestao
  where aprovado = false and aplicado_em is null;
$$;

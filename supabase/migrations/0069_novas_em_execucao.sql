-- Análise de "Novas em Execução": ações que viraram EM EXECUÇÃO desde a sincronização
-- anterior (vem de obras_estagio_log, migration 0068). A ação fica na fila até alguém
-- concluir a análise. Guarda só o ID (sem FK para obras), como as outras análises.
--
-- Os itens conferidos ficam num jsonb (chave do item -> status), então trocar ou
-- acrescentar item é só mexer na lista do painel, sem migration.

create table if not exists public.obras_exec_revisao (
  id_acao text primary key,
  itens jsonb not null default '{}'::jsonb,   -- { "documentos_obrigatorios": "confirmado", ... }
  obs jsonb not null default '{}'::jsonb,     -- comentário de cada item pendente
  concluido boolean not null default false,
  concluido_em timestamptz,
  concluido_por uuid references public.profiles(id),
  responsavel_id uuid references public.profiles(id),
  revisado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now()
);

alter table public.obras_exec_revisao enable row level security;

drop policy if exists "equipe aprovada le exec revisao" on public.obras_exec_revisao;
create policy "equipe aprovada le exec revisao"
  on public.obras_exec_revisao for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada insere exec revisao" on public.obras_exec_revisao;
create policy "equipe aprovada insere exec revisao"
  on public.obras_exec_revisao for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada atualiza exec revisao" on public.obras_exec_revisao;
create policy "equipe aprovada atualiza exec revisao"
  on public.obras_exec_revisao for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

grant select, insert, update on public.obras_exec_revisao to authenticated;

-- Fila: a última vez que cada ação virou EM EXECUÇÃO (estágio anterior diferente).
create or replace function public.novas_execucao_lista(
  mostrar_concluidos boolean default false,
  busca text default null,
  pagina int default 1,
  tamanho int default 30
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  virou_em date,
  estagio_anterior text,
  itens jsonb,
  obs jsonb,
  concluido boolean,
  responsavel_id uuid,
  responsavel_nome text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with eventos as (
    select distinct on (l.id_acao) l.id_acao, l.dia, l.estagio_anterior
    from public.obras_estagio_log l
    where upper(trim(coalesce(l.estagio_novo, ''))) in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and upper(trim(coalesce(l.estagio_anterior, ''))) not in ('EM EXECUÇÃO', 'EM EXECUCAO')
    order by l.id_acao, l.detectado_em desc
  ),
  base as (
    select
      e.id_acao,
      coalesce(o.nome_acao, '(ação não encontrada na base)') as nome_acao,
      o.orgao,
      o.data_criacao,
      e.dia as virou_em,
      e.estagio_anterior,
      coalesce(r.itens, '{}'::jsonb) as itens,
      coalesce(r.obs, '{}'::jsonb) as obs,
      coalesce(r.concluido, false) as concluido,
      r.responsavel_id,
      p.nome as responsavel_nome
    from eventos e
    left join public.obras o on o.id_acao = e.id_acao
    left join public.obras_exec_revisao r on r.id_acao = e.id_acao
    left join public.profiles p on p.id = r.responsavel_id
    where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
      and (mostrar_concluidos = coalesce(r.concluido, false))
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or e.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by virou_em desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.contar_novas_execucao_pendentes()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*) from (
    select distinct l.id_acao
    from public.obras_estagio_log l
    left join public.obras_exec_revisao r on r.id_acao = l.id_acao
    where upper(trim(coalesce(l.estagio_novo, ''))) in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and upper(trim(coalesce(l.estagio_anterior, ''))) not in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and not coalesce(r.concluido, false)
      and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  ) x;
$$;

revoke execute on function public.novas_execucao_lista(boolean, text, int, int) from public, anon;
revoke execute on function public.contar_novas_execucao_pendentes() from public, anon;
grant execute on function public.novas_execucao_lista(boolean, text, int, int) to authenticated;
grant execute on function public.contar_novas_execucao_pendentes() to authenticated;

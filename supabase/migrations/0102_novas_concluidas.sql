-- NOVAS CONCLUÍDAS: ações que ENTRARAM no status "Concluído". Mesma metodologia de "Novas em Execução"
-- (fila de análise, responsável, pendências comentadas, encaminhar ao órgão), com outros itens de checagem:
-- KML anexado e Termo de recebimento.
--
-- 1) obras_status_log: toda vez que a sincronização com o SIMO muda o STATUS de uma ação (ou traz uma ação nova),
--    a mudança é gravada aqui por um gatilho. É daí que sai a fila. Só grava a partir de agora: a lista nasce vazia
--    e na próxima sincronização mostra o que virou Concluído. Guarda só o ID e fotos de nome/órgão (sem FK).
-- 2) obras_concl_revisao: a análise de cada ação (itens por chave num jsonb, sem migration para trocar itens).
-- 3) Funções da fila, das encaminhadas ao órgão e do contador do menu.
-- 4) O histórico de desempenho (analises_log) passa a aceitar o módulo 'novas_concluidas'.

-- ---------- 1) histórico de status ----------
create table if not exists public.obras_status_log (
  id bigint generated always as identity primary key,
  id_acao text not null,
  nome_acao text,
  orgao text,
  status_anterior text,
  status_novo text,
  detectado_em timestamptz not null default now(),
  dia date not null default ((now() at time zone 'America/Fortaleza')::date)
);

create index if not exists obras_status_log_acao_idx on public.obras_status_log (id_acao, detectado_em desc);
create index if not exists obras_status_log_dia_idx on public.obras_status_log (dia);

alter table public.obras_status_log enable row level security;

drop policy if exists "equipe aprovada le historico de status" on public.obras_status_log;
create policy "equipe aprovada le historico de status"
  on public.obras_status_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

create or replace function public.registrar_mudanca_de_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.obras_status_log (id_acao, nome_acao, orgao, status_anterior, status_novo)
    values (new.id_acao, new.nome_acao, new.orgao, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.obras_status_log (id_acao, nome_acao, orgao, status_anterior, status_novo)
    values (new.id_acao, new.nome_acao, new.orgao, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists obras_registrar_status_ins on public.obras;
create trigger obras_registrar_status_ins
  after insert on public.obras
  for each row execute function public.registrar_mudanca_de_status();

drop trigger if exists obras_registrar_status_upd on public.obras;
create trigger obras_registrar_status_upd
  after update of status on public.obras
  for each row
  when (old.status is distinct from new.status)
  execute function public.registrar_mudanca_de_status();

-- ---------- 2) a análise ----------
create table if not exists public.obras_concl_revisao (
  id_acao text primary key,
  itens jsonb not null default '{}'::jsonb,   -- { "kml_anexado": "confirmado", "termo_recebimento": "pendente" ... }
  obs jsonb not null default '{}'::jsonb,     -- comentário de cada item pendente
  concluido boolean not null default false,
  concluido_em timestamptz,
  concluido_por uuid references public.profiles(id),
  responsavel_id uuid references public.profiles(id),
  revisado_por uuid references public.profiles(id),
  encaminhada_em timestamptz,
  encaminhada_por uuid references public.profiles(id),
  pendencia_resolvida_em timestamptz,
  pendencia_resolvida_por uuid references public.profiles(id),
  pendencia_resolvida_obs text,
  atualizado_em timestamptz not null default now()
);

alter table public.obras_concl_revisao enable row level security;

drop policy if exists "equipe aprovada le concl revisao" on public.obras_concl_revisao;
create policy "equipe aprovada le concl revisao"
  on public.obras_concl_revisao for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada insere concl revisao" on public.obras_concl_revisao;
create policy "equipe aprovada insere concl revisao"
  on public.obras_concl_revisao for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada atualiza concl revisao" on public.obras_concl_revisao;
create policy "equipe aprovada atualiza concl revisao"
  on public.obras_concl_revisao for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

grant select, insert, update on public.obras_concl_revisao to authenticated;

-- ---------- 3) funções ----------
-- Fila: a última vez que cada ação ENTROU em Concluído (status anterior diferente). Não mostra o que já foi
-- encaminhado ao órgão.
create or replace function public.novas_concluidas_lista(
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
  status_anterior text,
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
    select distinct on (l.id_acao) l.id_acao, l.dia, l.status_anterior
    from public.obras_status_log l
    where upper(trim(coalesce(l.status_novo, ''))) in ('CONCLUÍDO', 'CONCLUIDO', 'CONCLUÍDA', 'CONCLUIDA')
      and upper(trim(coalesce(l.status_anterior, ''))) not in ('CONCLUÍDO', 'CONCLUIDO', 'CONCLUÍDA', 'CONCLUIDA')
    order by l.id_acao, l.detectado_em desc
  ),
  base as (
    select
      e.id_acao,
      coalesce(o.nome_acao, '(ação não encontrada na base)') as nome_acao,
      o.orgao,
      o.data_criacao,
      e.dia as virou_em,
      e.status_anterior,
      coalesce(r.itens, '{}'::jsonb) as itens,
      coalesce(r.obs, '{}'::jsonb) as obs,
      coalesce(r.concluido, false) as concluido,
      r.responsavel_id,
      p.nome as responsavel_nome
    from eventos e
    left join public.obras o on o.id_acao = e.id_acao
    left join public.obras_concl_revisao r on r.id_acao = e.id_acao
    left join public.profiles p on p.id = r.responsavel_id
    where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
      and (mostrar_concluidos = coalesce(r.concluido, false))
      and r.encaminhada_em is null
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or e.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by virou_em desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

-- Aguardando solução de pendência: ações encaminhadas e ainda não concluídas.
create or replace function public.novas_concluidas_encaminhadas()
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  virou_em date,
  itens jsonb,
  obs jsonb,
  encaminhada_em timestamptz,
  encaminhada_por_nome text,
  responsavel_id uuid,
  responsavel_nome text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id_acao,
         coalesce(o.nome_acao, '(ação não encontrada na base)'),
         coalesce(nullif(trim(o.orgao), ''), 'Sem órgão'),
         o.data_criacao,
         (select max(l.dia) from public.obras_status_log l
           where l.id_acao = r.id_acao
             and upper(trim(coalesce(l.status_novo, ''))) in ('CONCLUÍDO', 'CONCLUIDO', 'CONCLUÍDA', 'CONCLUIDA')),
         r.itens, r.obs, r.encaminhada_em, pe.nome, r.responsavel_id, pr.nome
  from public.obras_concl_revisao r
  left join public.obras o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
    and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  order by 3, r.encaminhada_em desc;
$$;

-- Contador do menu: a fila de análise (sem o que já foi encaminhado ao órgão).
create or replace function public.contar_novas_concluidas_pendentes()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*) from (
    select distinct l.id_acao
    from public.obras_status_log l
    left join public.obras_concl_revisao r on r.id_acao = l.id_acao
    where upper(trim(coalesce(l.status_novo, ''))) in ('CONCLUÍDO', 'CONCLUIDO', 'CONCLUÍDA', 'CONCLUIDA')
      and upper(trim(coalesce(l.status_anterior, ''))) not in ('CONCLUÍDO', 'CONCLUIDO', 'CONCLUÍDA', 'CONCLUIDA')
      and not coalesce(r.concluido, false)
      and r.encaminhada_em is null
      and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  ) x;
$$;

revoke execute on function public.novas_concluidas_lista(boolean, text, int, int) from public, anon;
revoke execute on function public.novas_concluidas_encaminhadas() from public, anon;
revoke execute on function public.contar_novas_concluidas_pendentes() from public, anon;
grant execute on function public.novas_concluidas_lista(boolean, text, int, int) to authenticated;
grant execute on function public.novas_concluidas_encaminhadas() to authenticated;
grant execute on function public.contar_novas_concluidas_pendentes() to authenticated;

-- ---------- 4) histórico de desempenho aceita o módulo novo ----------
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.analises_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%modulo%'
  loop
    execute format('alter table public.analises_log drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.analises_log
  add constraint analises_log_modulo_check
  check (modulo in ('novas_acoes', 'sobreposicoes', 'termos', 'unidade_quantidade', 'vinculacao', 'novas_em_execucao', 'kml', 'configuracao_td', 'novas_concluidas'));

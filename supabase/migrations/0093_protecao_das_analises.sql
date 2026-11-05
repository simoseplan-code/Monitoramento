-- PROTEÇÃO DAS ANÁLISES E DOS COMENTÁRIOS
--
-- Em 05/11/2026 uma sincronização leu um relatório com 1 ação, apagou as outras obras e as análises feitas foram
-- perdidas. Aqui entram quatro camadas no banco (o código da sincronização ganha as suas, no painel):
--
--  1) As análises (Novas Ações, Termos, Unidade/Quantidade) NÃO podem ser apagadas junto com a obra (sem cascata).
--     Já existia na 0036; repetido aqui por segurança (não faz mal rodar de novo).
--  2) Toda mudança ou exclusão numa análise guarda ANTES uma cópia da linha (tabela analises_copias): comentário,
--     responsável, status... dá para voltar atrás linha a linha.
--  3) O banco RECUSA apagar muitas linhas de uma vez nas obras e nas análises, mesmo que o pedido venha de outro
--     lugar (outro código, o editor SQL). Para apagar de propósito, na mesma transação:
--         set local app.permitir_apagao = 'sim';
--  4) Tabela das fotos diárias das análises (analises_snapshot), gravadas pela sincronização, para o caso de
--     tudo o mais falhar. O administrador baixa a última foto pelo painel.

-- ───────────── 1) sem cascata ─────────────
do $$
declare
  r record;
begin
  for r in
    select con.conname, con.conrelid::regclass as tabela
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'public.obras'::regclass
      and con.conrelid in (
        'public.obras_revisao'::regclass,
        'public.obras_unidade_sugestao'::regclass,
        'public.obras_termos_revisao'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

-- ───────────── 2) cópia antes de mudar ou apagar ─────────────
create table if not exists public.analises_copias (
  id bigint generated always as identity primary key,
  tabela text not null,
  id_acao text,
  operacao text not null,            -- UPDATE ou DELETE
  linha jsonb not null,              -- a linha como estava ANTES
  registrado_em timestamptz not null default now()
);
create index if not exists analises_copias_busca_idx on public.analises_copias (tabela, id_acao, registrado_em desc);
alter table public.analises_copias enable row level security;
-- Sem regra de leitura: só o servidor (chave de serviço) e o editor SQL enxergam.

create or replace function public.copiar_analise_antes_de_mudar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analises_copias (tabela, id_acao, operacao, linha)
  values (tg_table_name, old.id_acao, tg_op, to_jsonb(old));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists obras_revisao_copia on public.obras_revisao;
create trigger obras_revisao_copia before update or delete on public.obras_revisao
  for each row execute function public.copiar_analise_antes_de_mudar();

drop trigger if exists obras_termos_revisao_copia on public.obras_termos_revisao;
create trigger obras_termos_revisao_copia before update or delete on public.obras_termos_revisao
  for each row execute function public.copiar_analise_antes_de_mudar();

drop trigger if exists obras_exec_revisao_copia on public.obras_exec_revisao;
create trigger obras_exec_revisao_copia before update or delete on public.obras_exec_revisao
  for each row execute function public.copiar_analise_antes_de_mudar();

-- ───────────── 3) o banco recusa apagão ─────────────
create or replace function public.bloquear_apagao_em_massa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  qtd bigint;
  limite bigint := tg_argv[0]::bigint;
begin
  select count(*) into qtd from apagadas;
  if qtd > limite and coalesce(current_setting('app.permitir_apagao', true), '') <> 'sim' then
    raise exception 'Bloqueado: % linhas apagadas de uma vez em % (limite %). Se for de propósito: set local app.permitir_apagao = ''sim''; na mesma transação.', qtd, tg_table_name, limite;
  end if;
  return null;
end;
$$;

drop trigger if exists obras_sem_apagao on public.obras;
create trigger obras_sem_apagao after delete on public.obras
  referencing old table as apagadas for each statement
  execute function public.bloquear_apagao_em_massa(300);

drop trigger if exists obras_revisao_sem_apagao on public.obras_revisao;
create trigger obras_revisao_sem_apagao after delete on public.obras_revisao
  referencing old table as apagadas for each statement
  execute function public.bloquear_apagao_em_massa(100);

drop trigger if exists obras_termos_revisao_sem_apagao on public.obras_termos_revisao;
create trigger obras_termos_revisao_sem_apagao after delete on public.obras_termos_revisao
  referencing old table as apagadas for each statement
  execute function public.bloquear_apagao_em_massa(100);

drop trigger if exists obras_exec_revisao_sem_apagao on public.obras_exec_revisao;
create trigger obras_exec_revisao_sem_apagao after delete on public.obras_exec_revisao
  referencing old table as apagadas for each statement
  execute function public.bloquear_apagao_em_massa(100);

-- ───────────── 4) fotos das análises ─────────────
create table if not exists public.analises_snapshot (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  motivo text,
  hash text,
  linhas int,
  dados_gzip_b64 text not null
);
alter table public.analises_snapshot enable row level security;
-- Sem regra de leitura: só o servidor grava e o administrador baixa pela API do painel.

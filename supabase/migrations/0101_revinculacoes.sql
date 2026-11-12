-- REVINCULAÇÃO (aba dentro de "Vinculação SIAFE")
--
-- Refaz a vinculação do contrato SIAFE de ações que já estavam vinculadas, para o SIMO atualizar os valores.
-- Cada tentativa guarda como a ação estava ANTES (valores do relatório do painel) e como ficou DEPOIS (lido na página
-- da ação no SIMO logo após revincular), para mostrar o que mudou. Só o servidor grava; a equipe aprovada lê.

create table if not exists public.revinculacoes (
  id bigserial primary key,
  id_acao text not null,
  nome_acao text,
  numero_usado text,
  origem_numero text,
  sucesso boolean not null default false,
  resultado text,
  antes jsonb,
  depois jsonb,
  executado_por uuid references public.profiles(id),
  executado_em timestamptz not null default now()
);

create index if not exists revinculacoes_acao_idx on public.revinculacoes (id_acao, executado_em desc);
create index if not exists revinculacoes_em_idx on public.revinculacoes (executado_em desc);

alter table public.revinculacoes enable row level security;

drop policy if exists "equipe aprovada le revinculacoes" on public.revinculacoes;
create policy "equipe aprovada le revinculacoes"
  on public.revinculacoes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

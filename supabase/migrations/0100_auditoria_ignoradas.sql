-- AÇÕES IGNORADAS NA "NOVA ANÁLISE EM TESTE" (auditoria de tipologia, unidade e quantidade)
--
-- Quando a equipe confere uma ação que a auditoria marcou e vê que está certa (falso alarme), ela é ignorada aqui:
-- sai da lista de problemas e dos cards, e passa a entrar nas estatísticas de custo (Análise de custos) como dado confiável.
-- Dá para restaurar. Só o servidor grava; a equipe aprovada lê.

create table if not exists public.auditoria_ignoradas (
  id_acao text primary key,
  motivo text,
  ignorado_por uuid references public.profiles(id),
  ignorado_em timestamptz not null default now()
);

alter table public.auditoria_ignoradas enable row level security;

drop policy if exists "equipe aprovada le auditoria_ignoradas" on public.auditoria_ignoradas;
create policy "equipe aprovada le auditoria_ignoradas"
  on public.auditoria_ignoradas for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

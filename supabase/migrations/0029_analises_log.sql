-- Histórico de análises para o dashboard de produtividade. Só acumula
-- (nunca é sobrescrito): cada decisão de alguém da equipe vira uma linha
-- — quem, em qual tela, sobre qual ação/local, o que decidiu e quando.
-- As colunas revisado_por/revisado_em das telas guardam só o ÚLTIMO
-- revisor e são zeradas ao reabrir, então não servem pra contar produção.

create table public.analises_log (
  id bigint generated always as identity primary key,
  modulo text not null check (modulo in ('novas_acoes', 'sobreposicoes', 'termos', 'unidade_quantidade', 'vinculacao')),
  referencia text not null,            -- id da ação (ou chave do local, em sobreposições)
  acao text not null,                  -- ex.: confirmado, ok, problema, corrigido, aprovado, gravado_no_simo
  detalhe text,                        -- ex.: qual item do checklist, resultado do SIMO
  usuario_id uuid not null references public.profiles(id),
  criado_em timestamptz not null default now()
);

create index analises_log_usuario_idx on public.analises_log (usuario_id, criado_em desc);
create index analises_log_modulo_idx on public.analises_log (modulo, criado_em desc);

alter table public.analises_log enable row level security;

-- Cada pessoa só registra em nome próprio (as rotas do servidor com
-- service_role passam por cima disto e gravam o executor real).
create policy "equipe aprovada registra a propria analise"
  on public.analises_log for insert
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
  );

-- Leitura só admin — é dado de desempenho da equipe.
create policy "admin le analises"
  on public.analises_log for select
  using (public.is_admin_aprovado(auth.uid()));

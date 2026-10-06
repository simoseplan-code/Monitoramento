-- Quando o órgão resolve a pendência, a ação é concluída. Guarda quando e por quem
-- a resolução foi registrada (a ação sai da aba "Aguardando solução de pendência").
alter table public.obras_revisao
  add column if not exists pendencia_resolvida_em timestamptz,
  add column if not exists pendencia_resolvida_por uuid references public.profiles(id);

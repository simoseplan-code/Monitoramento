-- Quem registra que o órgão resolveu a pendência (qualquer pessoa aprovada) deixa um comentário.
alter table public.obras_revisao
  add column if not exists pendencia_resolvida_obs text;

alter table public.obras_exec_revisao
  add column if not exists pendencia_resolvida_obs text;

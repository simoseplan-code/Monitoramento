-- Troca cada campo do checklist de boolean pra um status com 3 valores:
-- 'pendente' (ainda não revisado), 'confirmado' (ok) e
-- 'aguardando_atualizacao' (órgão precisa corrigir/completar algo).
alter table public.obras_revisao
  alter column kml_anexado drop default,
  alter column kml_anexado type text using (case when kml_anexado then 'confirmado' else 'pendente' end),
  alter column kml_anexado set default 'pendente',
  add constraint kml_anexado_valido check (kml_anexado in ('pendente', 'confirmado', 'aguardando_atualizacao')),

  alter column sem_duplicacao drop default,
  alter column sem_duplicacao type text using (case when sem_duplicacao then 'confirmado' else 'pendente' end),
  alter column sem_duplicacao set default 'pendente',
  add constraint sem_duplicacao_valido check (sem_duplicacao in ('pendente', 'confirmado', 'aguardando_atualizacao')),

  alter column trecho_unico drop default,
  alter column trecho_unico type text using (case when trecho_unico then 'confirmado' else 'pendente' end),
  alter column trecho_unico set default 'pendente',
  add constraint trecho_unico_valido check (trecho_unico in ('pendente', 'confirmado', 'aguardando_atualizacao')),

  alter column documentos_obrigatorios drop default,
  alter column documentos_obrigatorios type text using (case when documentos_obrigatorios then 'confirmado' else 'pendente' end),
  alter column documentos_obrigatorios set default 'pendente',
  add constraint documentos_obrigatorios_valido check (documentos_obrigatorios in ('pendente', 'confirmado', 'aguardando_atualizacao'));

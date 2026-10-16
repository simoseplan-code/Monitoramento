-- Desempenho: a Configuração de TD (cadastro de ações mãe e filhas) também entra na gravação
-- por pessoa. Só soma a regra de módulos aceita pelo histórico.
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
  check (modulo in ('novas_acoes', 'sobreposicoes', 'termos', 'unidade_quantidade', 'vinculacao', 'novas_em_execucao', 'kml', 'configuracao_td'));

-- Retroativo: quem já cadastrou ação mãe ou filha.
insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
select 'configuracao_td', m.id_acao, 'adicionar_mae', 'retroativo', m.criado_por, m.criado_em
from public.td_acoes_mae m
where m.criado_por is not null
  and not exists (select 1 from public.analises_log a where a.modulo = 'configuracao_td' and a.referencia = m.id_acao and a.usuario_id = m.criado_por);

insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
select 'configuracao_td', f.id_acao, 'adicionar_filha', 'retroativo', f.criado_por, f.criado_em
from public.td_acoes_filha f
where f.criado_por is not null
  and not exists (select 1 from public.analises_log a where a.modulo = 'configuracao_td' and a.referencia = f.id_acao and a.usuario_id = f.criado_por);

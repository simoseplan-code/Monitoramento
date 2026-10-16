-- Desempenho: entram as telas novas.
--   novas_em_execucao : análise das ações que viraram EM EXECUÇÃO
--   kml               : análise de KML (analisado = abriu a análise; baixado_no_simo = baixou do SIMO)
-- 1) o histórico (analises_log) passa a aceitar os dois módulos;
-- 2) o que já foi feito antes entra como "retroativo" (1 evento por ação e pessoa);
-- 3) função com a situação por pessoa em Novas em Execução (concluída x pendente).

-- Derruba qualquer regra antiga que limite o módulo (o nome pode variar) antes de criar a nova.
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
  check (modulo in ('novas_acoes', 'sobreposicoes', 'termos', 'unidade_quantidade', 'vinculacao', 'novas_em_execucao', 'kml'));

-- Retroativo de Novas em Execução: quem analisou (responsável) e quem concluiu.
insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
select 'novas_em_execucao', r.id_acao, 'checklist', 'retroativo', coalesce(r.revisado_por, r.responsavel_id), r.atualizado_em
from public.obras_exec_revisao r
where coalesce(r.revisado_por, r.responsavel_id) is not null
  and exists (select 1 from jsonb_each_text(r.itens) i where i.value <> 'pendente')
  and not exists (
    select 1 from public.analises_log a
    where a.modulo = 'novas_em_execucao' and a.referencia = r.id_acao and a.usuario_id = coalesce(r.revisado_por, r.responsavel_id)
  );

insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
select 'novas_em_execucao', r.id_acao, 'concluido', 'retroativo', r.concluido_por, coalesce(r.concluido_em, r.atualizado_em)
from public.obras_exec_revisao r
where r.concluido and r.concluido_por is not null
  and not exists (
    select 1 from public.analises_log a
    where a.modulo = 'novas_em_execucao' and a.referencia = r.id_acao and a.usuario_id = r.concluido_por
  );

-- Retroativo de KML: quem baixou cada KML do SIMO.
insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
select 'kml', k.id_acao, 'baixado_no_simo', 'retroativo', k.baixado_por, k.baixado_em
from public.kml_arquivos k
where k.situacao = 'baixado' and k.baixado_por is not null and k.baixado_em is not null
  and not exists (
    select 1 from public.analises_log a
    where a.modulo = 'kml' and a.referencia = k.id_acao and a.usuario_id = k.baixado_por
  );

-- Situação por pessoa em Novas em Execução: concluída (flag concluído) ou pendente (começou e
-- ainda não concluiu). 1 por ação, atribuída ao responsável pela análise (só admin/chefe lê).
create or replace function public.desempenho_execucao(
  data_de date default null,
  data_ate date default null
)
returns table (
  usuario_id uuid,
  situacao text,
  total bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(r.responsavel_id, r.revisado_por, r.concluido_por) as usuario_id,
    case when coalesce(r.concluido, false) then 'ok' else 'pendencia' end as situacao,
    count(*) as total
  from public.obras_exec_revisao r
  where public.is_admin_aprovado(auth.uid())
    and coalesce(r.responsavel_id, r.revisado_por, r.concluido_por) is not null
    and (
      coalesce(r.concluido, false)
      or exists (select 1 from jsonb_each_text(r.itens) i where i.value <> 'pendente')
    )
    and (data_de is null or (coalesce(r.concluido_em, r.atualizado_em) at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (coalesce(r.concluido_em, r.atualizado_em) at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 2;
$$;

revoke execute on function public.desempenho_execucao(date, date) from public, anon;
grant execute on function public.desempenho_execucao(date, date) to authenticated;

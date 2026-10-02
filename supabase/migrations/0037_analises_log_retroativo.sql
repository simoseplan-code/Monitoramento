-- O analises_log só começou a acumular na migration 0029. Aqui entra o que
-- a equipe já tinha feito ANTES disso, lendo o "último revisor" que cada tela
-- guarda (revisado_por/revisado_em etc.). É uma foto aproximada: esses campos
-- só têm a última pessoa por ação, então o retroativo conta 1 evento por ação
-- por tela. Tudo que for anterior ao primeiro registro do log (corte) entra;
-- o que é posterior já foi registrado em tempo real. Marcado com
-- detalhe = 'retroativo' pra dar pra separar/apagar depois se quiser.

do $$
declare
  corte timestamptz;
begin
  select coalesce(min(criado_em), now()) into corte from public.analises_log where detalhe is distinct from 'retroativo';

  if exists (select 1 from public.analises_log where detalhe = 'retroativo') then
    raise notice 'Retroativo já foi carregado — nada a fazer.';
    return;
  end if;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'novas_acoes', r.id_acao, 'checklist', 'retroativo', r.revisado_por, r.revisado_em
  from public.obras_revisao r
  where r.revisado_por is not null and r.revisado_em is not null and r.revisado_em < corte;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'novas_acoes', r.id_acao, 'concluido', 'retroativo', r.concluido_por, r.concluido_em
  from public.obras_revisao r
  where r.concluido and r.concluido_por is not null and r.concluido_em is not null and r.concluido_em < corte;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'sobreposicoes', s.chave_local, s.status, 'retroativo', s.revisado_por, s.revisado_em
  from public.sobreposicoes s
  where s.status <> 'pendente'
    and s.revisado_por is not null and s.revisado_em is not null and s.revisado_em < corte
    and coalesce(s.observacao, '') not like 'Carregado automaticamente%';

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'termos', t.id_acao, t.status, 'retroativo', t.revisado_por, t.revisado_em
  from public.obras_termos_revisao t
  where t.status <> 'pendente'
    and t.revisado_por is not null and t.revisado_em is not null and t.revisado_em < corte;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'unidade_quantidade', u.id_acao, 'aprovado', 'retroativo', u.aprovado_por, u.aprovado_em
  from public.obras_unidade_sugestao u
  where u.aprovado and u.aprovado_por is not null and u.aprovado_em is not null and u.aprovado_em < corte;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'unidade_quantidade', l.id_acao,
         case when l.resultado ilike 'sucesso%' then 'gravado_no_simo' else 'falha_gravacao' end,
         'retroativo', l.executado_por, l.executado_em
  from public.obras_unidade_log l
  where l.executado_por is not null and l.executado_em < corte;

  insert into public.analises_log (modulo, referencia, acao, detalhe, usuario_id, criado_em)
  select 'vinculacao', v.id_acao,
         case when v.resultado ilike 'sucesso%' then 'vinculado' else 'falha_vinculacao' end,
         'retroativo', v.executado_por, v.executado_em
  from public.obras_vinculacao_log v
  where v.executado_por is not null and v.executado_em < corte;
end $$;

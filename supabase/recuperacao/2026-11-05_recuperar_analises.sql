-- RECUPERAÇÃO (uma vez só, fora da pasta migrations): refaz as análises apagadas em 05/11/2026 quando a
-- sincronização leu um relatório com 1 ação e apagou as demais obras (as análises ligadas à obra foram junto).
--
-- Não há backup (plano Free), então tudo vem do histórico de marcações (analises_log), que não foi apagado.
-- O que volta: Novas Ações (estado de cada item do checklist, concluídas, responsável) e Termos (status).
-- O que NÃO volta: comentários dos itens pendentes, a data/pessoa do "encaminhar ao órgão", e o dia exato da
-- última edição quando houve mais de uma. Quem estava "aguardando atualização" volta como item aguardando
-- (mas na fila Em análise, não na aba de encaminhadas).
--
-- É seguro rodar: só INSERE o que está faltando ("on conflict do nothing"); não muda nem apaga nenhuma linha que
-- já exista (por exemplo, o que a equipe refez desde as 11:20 de hoje fica como está).

-- ───────────── A) NOVAS AÇÕES ─────────────
insert into public.obras_revisao
  (id_acao, kml_anexado, sem_duplicacao, documentos_obrigatorios,
   concluido, concluido_em, concluido_por, responsavel_id, revisado_por, revisado_em, atualizado_em)
select
  a.id_acao,
  case when c.concluida then 'confirmado' else coalesce(i.kml, case when a.retro then 'confirmado' end, 'pendente') end,
  case when c.concluida then 'confirmado' else coalesce(i.dup, case when a.retro then 'confirmado' end, 'pendente') end,
  case when c.concluida then 'confirmado' else coalesce(i.doc, case when a.retro then 'confirmado' end, 'pendente') end,
  coalesce(c.concluida, false),
  case when c.concluida then c.criado_em end,
  case when c.concluida then c.usuario_id end,
  a.usuario_id,
  a.usuario_id,
  case
    when c.concluida then a.criado_em
    when coalesce(i.kml, case when a.retro then 'confirmado' end, 'pendente') = 'confirmado'
     and coalesce(i.dup, case when a.retro then 'confirmado' end, 'pendente') = 'confirmado'
     and coalesce(i.doc, case when a.retro then 'confirmado' end, 'pendente') = 'confirmado' then a.criado_em
  end,
  a.criado_em
from (
  -- a última pessoa e o último momento de cada ação (e se veio do registro retroativo de antes do histórico)
  select distinct on (l.referencia) l.referencia as id_acao, l.usuario_id, l.criado_em,
         exists (select 1 from public.analises_log r where r.modulo = 'novas_acoes' and r.referencia = l.referencia
                 and r.acao = 'checklist' and r.detalhe = 'retroativo') as retro
  from public.analises_log l
  where l.modulo = 'novas_acoes' and l.acao <> 'baixa'
  order by l.referencia, l.criado_em desc
) a
join public.obras o on o.id_acao = a.id_acao
left join (
  -- estado atual de cada um dos 3 itens = a última marcação dele
  select id_acao,
         max(estado) filter (where detalhe = 'kml_anexado') as kml,
         max(estado) filter (where detalhe = 'sem_duplicacao') as dup,
         max(estado) filter (where detalhe = 'documentos_obrigatorios') as doc
  from (
    select distinct on (referencia, detalhe) referencia as id_acao, detalhe, acao as estado
    from public.analises_log
    where modulo = 'novas_acoes'
      and detalhe in ('kml_anexado', 'sem_duplicacao', 'documentos_obrigatorios')
      and acao in ('pendente', 'confirmado', 'aguardando_atualizacao')
    order by referencia, detalhe, criado_em desc
  ) u
  group by id_acao
) i on i.id_acao = a.id_acao
left join (
  -- foi concluída? vale a última conclusão/reabertura, e só se nenhum item foi desmarcado depois dela
  select k.id_acao, k.usuario_id, k.criado_em, (k.acao = 'concluido') as concluida
  from (
    select distinct on (referencia) referencia as id_acao, acao, usuario_id, criado_em
    from public.analises_log
    where modulo = 'novas_acoes' and acao in ('concluido', 'reaberto')
    order by referencia, criado_em desc
  ) k
  where not exists (
    select 1 from public.analises_log m
    where m.modulo = 'novas_acoes' and m.referencia = k.id_acao and m.criado_em > k.criado_em
      and m.detalhe in ('kml_anexado', 'sem_duplicacao', 'documentos_obrigatorios')
      and m.acao in ('pendente', 'aguardando_atualizacao')
  )
) c on c.id_acao = a.id_acao
on conflict (id_acao) do nothing;

-- ───────────── B) TERMOS (OUTROS DOCUMENTOS) ─────────────
insert into public.obras_termos_revisao (id_acao, status, revisado_por, revisado_em, atualizado_em)
select distinct on (l.referencia) l.referencia, l.acao, l.usuario_id, l.criado_em, l.criado_em
from public.analises_log l
join public.obras o on o.id_acao = l.referencia
where l.modulo = 'termos' and l.acao in ('pendente', 'corrigido', 'problema')
order by l.referencia, l.criado_em desc
on conflict (id_acao) do nothing;

-- Conferência: quantas linhas voltaram.
select
  (select count(*) from public.obras_revisao) as novas_acoes,
  (select count(*) from public.obras_revisao where concluido) as novas_acoes_concluidas,
  (select count(*) from public.obras_termos_revisao) as termos;

-- ───────────── C) PENDÊNCIAS ENCAMINHADAS AO ÓRGÃO (rode DEPOIS de conferir A e B) ─────────────
-- O "encaminhar ao órgão" não ficou no histórico, então isto é uma ESTIMATIVA: toda ação reconstruída que tinha
-- item "aguardando atualização" e não estava concluída volta para a aba "Aguardando solução de pendência".
-- Só mexe nas linhas que a recuperação acabou de recriar (atualizadas antes da apagada de 11:06 UTC de hoje).
update public.obras_revisao
set encaminhada_em = atualizado_em,
    encaminhada_por = coalesce(responsavel_id, revisado_por)
where encaminhada_em is null
  and not concluido
  and 'aguardando_atualizacao' in (kml_anexado, sem_duplicacao, documentos_obrigatorios)
  and atualizado_em < '2026-11-05 11:00:00+00';

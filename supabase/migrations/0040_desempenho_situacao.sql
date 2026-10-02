-- Situação ATUAL das ações que cada pessoa analisou, 1 por ação/local:
--   ok         = análise concluída/resolvida
--   pendencia  = analisou e ainda tem algo laranja (quando resolver, vira ok)
--   andamento  = começou a analisar, sem pendência e ainda não concluída
-- Quem "analisou" = o último revisor registrado na própria tela. Por ser o
-- estado atual, muda sozinho quando a pessoa resolve a pendência.
--   Novas Ações   : ok = "Concluir análise" feito; pendencia = algum item em
--                   "aguardando atualização" (laranja)
--   Sobreposições : ok = sem problema; pendencia = com problema
--   Termos        : ok = corrigido; pendencia = com problema
--   Unidade/Qtd   : ok = aprovada e gravada no SIMO; pendencia = aprovada, ainda
--                   não gravada (ou gravação falhou)
--   Vinculação    : ok = ação vinculada; pendencia = última tentativa falhou
-- data_de/data_ate filtram pela data da decisão da pessoa.

create or replace function public.desempenho_situacao(
  data_de date default null,
  data_ate date default null
)
returns table (
  usuario_id uuid,
  modulo text,
  situacao text,
  total bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with itens as (
    select
      coalesce(r.revisado_por, r.concluido_por) as usuario_id,
      'novas_acoes'::text as modulo,
      case
        when coalesce(r.concluido, false) then 'ok'
        when r.kml_anexado = 'aguardando_atualizacao'
          or r.sem_duplicacao = 'aguardando_atualizacao'
          or r.documentos_obrigatorios = 'aguardando_atualizacao' then 'pendencia'
        else 'andamento'
      end as situacao,
      coalesce(r.concluido_em, r.revisado_em) as quando
    from public.obras_revisao r
    where coalesce(r.revisado_por, r.concluido_por) is not null
      and (
        coalesce(r.concluido, false)
        or r.kml_anexado <> 'pendente'
        or r.sem_duplicacao <> 'pendente'
        or r.documentos_obrigatorios <> 'pendente'
      )

    union all

    select s.revisado_por, 'sobreposicoes',
           case s.status when 'ok' then 'ok' else 'pendencia' end,
           s.revisado_em
    from public.sobreposicoes s
    where s.status <> 'pendente'
      and s.revisado_por is not null
      and coalesce(s.observacao, '') not like 'Carregado automaticamente%'

    union all

    select t.revisado_por, 'termos',
           case t.status when 'corrigido' then 'ok' else 'pendencia' end,
           t.revisado_em
    from public.obras_termos_revisao t
    where t.status <> 'pendente' and t.revisado_por is not null

    union all

    select u.aprovado_por, 'unidade_quantidade',
           case when u.aplicado_em is not null and coalesce(u.aplicado_com_sucesso, false) then 'ok' else 'pendencia' end,
           u.aprovado_em
    from public.obras_unidade_sugestao u
    where u.aprovado and u.aprovado_por is not null

    union all

    select v.usuario_id, 'vinculacao',
           case when v.vinculada then 'ok' else 'pendencia' end,
           v.quando
    from (
      select distinct on (l.id_acao)
        l.executado_por as usuario_id,
        (o.numero_automatico is not null or l.resultado ilike 'sucesso%') as vinculada,
        l.executado_em as quando
      from public.obras_vinculacao_log l
      left join public.obras o on o.id_acao = l.id_acao
      where l.executado_por is not null
      order by l.id_acao, l.executado_em desc
    ) v
  )
  select i.usuario_id, i.modulo, i.situacao, count(*) as total
  from itens i
  where public.is_admin_aprovado(auth.uid())
    and (data_de is null or (i.quando at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (i.quando at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 2, 3;
$$;

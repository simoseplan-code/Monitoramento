-- Novas em Execução com a mesma metodologia de Novas Ações: ações com item pendente
-- podem ser encaminhadas ao órgão ("Aguardando solução de pendência"), saem da fila de
-- análise e aparecem agrupadas por órgão (com PDF). Quando o órgão resolve, a ação é
-- concluída; também dá para voltar para a análise.

alter table public.obras_exec_revisao
  add column if not exists encaminhada_em timestamptz,
  add column if not exists encaminhada_por uuid references public.profiles(id),
  add column if not exists pendencia_resolvida_em timestamptz,
  add column if not exists pendencia_resolvida_por uuid references public.profiles(id);

drop function if exists public.novas_execucao_lista(boolean, text, int, int);

-- Fila de análise: não mostra o que já foi encaminhado ao órgão.
create or replace function public.novas_execucao_lista(
  mostrar_concluidos boolean default false,
  busca text default null,
  pagina int default 1,
  tamanho int default 30
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  virou_em date,
  estagio_anterior text,
  itens jsonb,
  obs jsonb,
  concluido boolean,
  responsavel_id uuid,
  responsavel_nome text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with eventos as (
    select distinct on (l.id_acao) l.id_acao, l.dia, l.estagio_anterior
    from public.obras_estagio_log l
    where upper(trim(coalesce(l.estagio_novo, ''))) in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and upper(trim(coalesce(l.estagio_anterior, ''))) not in ('EM EXECUÇÃO', 'EM EXECUCAO')
    order by l.id_acao, l.detectado_em desc
  ),
  base as (
    select
      e.id_acao,
      coalesce(o.nome_acao, '(ação não encontrada na base)') as nome_acao,
      o.orgao,
      o.data_criacao,
      e.dia as virou_em,
      e.estagio_anterior,
      coalesce(r.itens, '{}'::jsonb) as itens,
      coalesce(r.obs, '{}'::jsonb) as obs,
      coalesce(r.concluido, false) as concluido,
      r.responsavel_id,
      p.nome as responsavel_nome
    from eventos e
    left join public.obras o on o.id_acao = e.id_acao
    left join public.obras_exec_revisao r on r.id_acao = e.id_acao
    left join public.profiles p on p.id = r.responsavel_id
    where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
      and (mostrar_concluidos = coalesce(r.concluido, false))
      and r.encaminhada_em is null
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or e.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by virou_em desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

-- Aguardando solução de pendência: ações encaminhadas e ainda não concluídas.
create or replace function public.novas_execucao_encaminhadas()
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  virou_em date,
  itens jsonb,
  obs jsonb,
  encaminhada_em timestamptz,
  encaminhada_por_nome text,
  responsavel_id uuid,
  responsavel_nome text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id_acao,
         coalesce(o.nome_acao, '(ação não encontrada na base)'),
         coalesce(nullif(trim(o.orgao), ''), 'Sem órgão'),
         o.data_criacao,
         (select max(l.dia) from public.obras_estagio_log l
           where l.id_acao = r.id_acao
             and upper(trim(coalesce(l.estagio_novo, ''))) in ('EM EXECUÇÃO', 'EM EXECUCAO')),
         r.itens, r.obs, r.encaminhada_em, pe.nome, r.responsavel_id, pr.nome
  from public.obras_exec_revisao r
  left join public.obras o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
    and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  order by 3, r.encaminhada_em desc;
$$;

-- O contador da fila não inclui o que já foi encaminhado ao órgão.
create or replace function public.contar_novas_execucao_pendentes()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*) from (
    select distinct l.id_acao
    from public.obras_estagio_log l
    left join public.obras_exec_revisao r on r.id_acao = l.id_acao
    where upper(trim(coalesce(l.estagio_novo, ''))) in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and upper(trim(coalesce(l.estagio_anterior, ''))) not in ('EM EXECUÇÃO', 'EM EXECUCAO')
      and not coalesce(r.concluido, false)
      and r.encaminhada_em is null
      and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  ) x;
$$;

revoke execute on function public.novas_execucao_lista(boolean, text, int, int) from public, anon;
revoke execute on function public.novas_execucao_encaminhadas() from public, anon;
revoke execute on function public.contar_novas_execucao_pendentes() from public, anon;
grant execute on function public.novas_execucao_lista(boolean, text, int, int) to authenticated;
grant execute on function public.novas_execucao_encaminhadas() to authenticated;
grant execute on function public.contar_novas_execucao_pendentes() to authenticated;

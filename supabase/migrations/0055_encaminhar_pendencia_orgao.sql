-- "Aguardando solução de pendência": ações de Novas Ações com item pendente que o
-- analista encaminha (em grupo) para o órgão resolver. Saem da fila de análise e
-- entram numa aba própria, agrupadas por órgão, de onde sai o PDF de pendências.
-- Parte 1: colunas, contadores e a lista da nova aba (a lista principal está na 0056).

alter table public.obras_revisao
  add column if not exists encaminhada_em timestamptz,
  add column if not exists encaminhada_por uuid references public.profiles(id);

-- O número do menu e o aviso do subtítulo contam só o que está na fila de análise:
-- o que foi encaminhado ao órgão não é mais trabalho do analista.
create or replace function public.contar_novas_acoes_pendentes(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  left join public.obras_revisao r on r.id_acao = o.id_acao
  where o.data_criacao >= data_inicio
    and o.data_criacao <= (current_date - interval '1 day')
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and r.encaminhada_em is null
    and (
      r.id_acao is null
      or coalesce(r.kml_anexado, 'pendente') <> 'confirmado'
      or coalesce(r.sem_duplicacao, 'pendente') <> 'confirmado'
      or coalesce(r.documentos_obrigatorios, 'pendente') <> 'confirmado'
    );
$$;

create or replace function public.contar_aguardando_atualizacao(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras o
  join public.obras_revisao r on r.id_acao = o.id_acao
  where o.data_criacao >= data_inicio
    and o.data_criacao <= (current_date - interval '1 day')
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and coalesce(r.concluido, false) = false
    and r.encaminhada_em is null
    and (
      r.kml_anexado = 'aguardando_atualizacao'
      or r.sem_duplicacao = 'aguardando_atualizacao'
      or r.documentos_obrigatorios = 'aguardando_atualizacao'
    );
$$;

-- Lista da aba "Aguardando solução de pendência" (agrupada por órgão no app).
create or replace function public.novas_acoes_encaminhadas()
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  kml_anexado text,
  sem_duplicacao text,
  documentos_obrigatorios text,
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
  select o.id_acao, o.nome_acao, coalesce(nullif(trim(o.orgao), ''), 'Sem órgão'), o.data_criacao,
         r.kml_anexado, r.sem_duplicacao, r.documentos_obrigatorios,
         r.encaminhada_em, pe.nome, r.responsavel_id, pr.nome
  from public.obras_revisao r
  join public.obras o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
  order by 3, r.encaminhada_em desc;
$$;

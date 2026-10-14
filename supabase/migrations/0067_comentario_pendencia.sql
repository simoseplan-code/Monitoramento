-- Comentário curto em cada item marcado como pendente (o que aconteceu), que aparece na
-- aba "Aguardando solução de pendência" e no PDF de pendências. Nos itens que não estão
-- pendentes o campo fica vazio.
alter table public.obras_revisao
  add column if not exists kml_obs text,
  add column if not exists duplicacao_obs text,
  add column if not exists documentos_obs text;

drop function if exists public.novas_acoes_lista(date, text, text, boolean, int, int);

create or replace function public.novas_acoes_lista(
  data_inicio date,
  busca text default null,
  orgao_filtro text default null,
  mostrar_concluidos boolean default false,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  kml_anexado text,
  sem_duplicacao text,
  documentos_obrigatorios text,
  concluido boolean,
  responsavel_id uuid,
  responsavel_nome text,
  kml_obs text,
  duplicacao_obs text,
  documentos_obs text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.data_criacao,
      coalesce(r.kml_anexado, 'pendente') as kml_anexado,
      coalesce(r.sem_duplicacao, 'pendente') as sem_duplicacao,
      coalesce(r.documentos_obrigatorios, 'pendente') as documentos_obrigatorios,
      coalesce(r.concluido, false) as concluido,
      r.responsavel_id,
      p.nome as responsavel_nome,
      r.kml_obs,
      r.duplicacao_obs,
      r.documentos_obs
    from public.obras o
    left join public.obras_revisao r on r.id_acao = o.id_acao
    left join public.profiles p on p.id = r.responsavel_id
    where o.data_criacao >= data_inicio
      and o.data_criacao <= (current_date - interval '1 day')
      and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
      and r.encaminhada_em is null
      and (mostrar_concluidos or coalesce(r.concluido, false) = false)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select base.*, count(*) over() as total_geral
  from base
  order by data_criacao desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

drop function if exists public.novas_acoes_encaminhadas();

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
  responsavel_nome text,
  kml_obs text,
  duplicacao_obs text,
  documentos_obs text
)
language sql
security definer
set search_path = public
stable
as $$
  select o.id_acao, o.nome_acao, coalesce(nullif(trim(o.orgao), ''), 'Sem órgão'), o.data_criacao,
         r.kml_anexado, r.sem_duplicacao, r.documentos_obrigatorios,
         r.encaminhada_em, pe.nome, r.responsavel_id, pr.nome,
         r.kml_obs, r.duplicacao_obs, r.documentos_obs
  from public.obras_revisao r
  join public.obras o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
  order by 3, r.encaminhada_em desc;
$$;

revoke execute on function public.novas_acoes_lista(date, text, text, boolean, int, int) from public, anon;
revoke execute on function public.novas_acoes_encaminhadas() from public, anon;
grant execute on function public.novas_acoes_lista(date, text, text, boolean, int, int) to authenticated;
grant execute on function public.novas_acoes_encaminhadas() to authenticated;

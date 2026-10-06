-- Parte 2: a lista principal de Novas Ações não mostra o que já foi encaminhado
-- ao órgão (essas ações aparecem na aba "Aguardando solução de pendência").
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
      p.nome as responsavel_nome
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

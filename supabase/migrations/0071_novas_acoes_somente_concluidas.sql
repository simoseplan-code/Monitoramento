  -- Aba "Concluídas" de Novas Ações (só para admin/chefe na tela): lista apenas as análises concluídas.
  
  drop function if exists public.novas_acoes_lista(date, text, text, boolean, int, int);
  
  create or replace function public.novas_acoes_lista(
    data_inicio date,
    busca text default null,
    orgao_filtro text default null,
    mostrar_concluidos boolean default false,
    pagina int default 1,
    tamanho int default 50,
    somente_concluidos boolean default false
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
        and (
          case when somente_concluidos then coalesce(r.concluido, false)
               else (mostrar_concluidos or coalesce(r.concluido, false) = false) end
        )
        and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
        and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
    )
    select base.*, count(*) over() as total_geral
    from base
    order by data_criacao desc, id_acao desc
    limit tamanho offset (pagina - 1) * tamanho;
  $$;
  
  revoke execute on function public.novas_acoes_lista(date, text, text, boolean, int, int, boolean) from public, anon;
  grant execute on function public.novas_acoes_lista(date, text, text, boolean, int, int, boolean) to authenticated;

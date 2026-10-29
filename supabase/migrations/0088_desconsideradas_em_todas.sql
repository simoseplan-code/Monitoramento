-- "Todas as análises": o ID desconsiderado na lista "Todas" (menu Ações desconsideradas) sai de TUDO:
-- listas, contagens do menu, dashboard, Sobreposições, Novas Ações, Vinculação, Termos, Unidade/Quantidade,
-- Verificação de bairros etc. A ÚNICA exceção é a Configuração de TD (que lê a base com acesso próprio).
--
-- Como funciona:
--  1) obras_visiveis: a tabela obras SEM os IDs da lista "todas". As funções do banco que liam "obras" passam
--     a ler esta visão (só mudou a tabela de onde leem; o resto de cada função é idêntico).
--  2) Regra de acesso (RLS) em obras: quem consulta a tabela direto pelo painel também deixa de ver esses IDs.
--     O servidor (sincronização com o SIMO, etc.) continua enxergando tudo.
--  3) Sobreposições: o local perde a ação desconsiderada e só aparece se sobrarem 2 ou mais ações.
-- Se devolver o ID na lista "Todas", ele volta a aparecer em tudo.

-- Ações de um local de sobreposição, sem as desconsideradas em "todas".
create or replace function public.sobreposicao_obras_ativas(obras jsonb)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(e.value), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(obras) = 'array' then obras else '[]'::jsonb end) e
  where not exists (
    select 1 from public.acoes_desconsideradas d
    where d.tela = 'todas' and d.id_acao = e.value ->> 'id'
  );
$$;

revoke execute on function public.sobreposicao_obras_ativas(jsonb) from public, anon, authenticated;

-- A base de ações sem os IDs desconsiderados em "todas".
create or replace view public.obras_visiveis as
select o.*
from public.obras o
where not exists (
  select 1 from public.acoes_desconsideradas d
  where d.tela = 'todas' and d.id_acao = o.id_acao
);

revoke all on public.obras_visiveis from public, anon, authenticated;

-- Quem consulta obras direto (as telas do painel) também não vê os IDs de "todas".
drop policy if exists "obras sem desconsideradas em todas" on public.obras;
create policy "obras sem desconsideradas em todas"
  on public.obras as restrictive for select to authenticated
  using (not exists (
    select 1 from public.acoes_desconsideradas d
    where d.tela = 'todas' and d.id_acao = obras.id_acao
  ));

-- ---------------------------------------------------------------------------------------------
-- Funções recriadas (mesmo texto de antes, lendo obras_visiveis em vez de obras)
-- ---------------------------------------------------------------------------------------------

create or replace function public.acoes_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(o.orgao) as orgao
  from public.obras_visiveis o
  where trim(coalesce(o.orgao, '')) <> ''
  order by 1;
$$;

create or replace function public.bairros_pendentes(limite integer default 60)
returns table (id_acao text, fonte text, assinatura text)
language sql
security definer
set search_path = public
stable
as $$
  select g.id_acao, g.fonte, g.assinatura
  from public.bairros_geometrias() g
  join public.obras_visiveis o on o.id_acao = g.id_acao
  left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
  where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte
  order by g.id_acao
  limit greatest(1, limite);
$$;

create or replace function public.bairros_resumo()
returns table (verificadas bigint, pendentes bigint, ultima timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.acao_bairros_calculo),
    (select count(*)
       from public.bairros_geometrias() g
       join public.obras_visiveis o on o.id_acao = g.id_acao
       left join public.acao_bairros_calculo c on c.id_acao = g.id_acao
       where c.id_acao is null or c.assinatura <> g.assinatura or c.fonte <> g.fonte),
    (select max(calculado_em) from public.acao_bairros_calculo)
  where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado');
$$;

create or replace function public.contar_aguardando_atualizacao(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_visiveis o
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

create or replace function public.contar_novas_acoes_pendentes(data_inicio date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_visiveis o
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

create or replace function public.contar_sugestoes_unidade_pendentes(ano_minimo int default 2023)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_unidade_sugestao s
  join public.obras_visiveis o on o.id_acao = s.id_acao
  where s.aprovado = false
    and s.aplicado_em is null
    and (ano_minimo is null or extract(year from o.data_criacao) >= ano_minimo)
    and lower(coalesce(o.status, '')) not in ('concluído', 'concluido');
$$;

create or replace function public.contar_termos_pendentes()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_visiveis o
  left join public.obras_termos_revisao r on r.id_acao = o.id_acao
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and coalesce(r.status, 'pendente') = 'pendente';
$$;

create or replace function public.contar_vinculacao_pendentes_validas()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.obras_visiveis o
  where o.numero_automatico is null
    and o.numero_siafe ~ '^[0-9]{8}$'
    and coalesce(lower(o.status), '') <> 'cancelado'
    and upper(coalesce(o.orgao, '')) <> 'AGESPISA'
    and not (o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe);
$$;

create or replace function public.dashboard_gestao_resumo(data_corte date default '2023-01-01')
returns table (
  antes_corte bigint,
  sem_data bigint,
  apos_corte_total bigint,
  apos_corte_vinculadas bigint,
  apos_corte_pendentes bigint,
  apos_corte_sem_numero bigint,
  apos_corte_dado_incorreto bigint,
  apos_corte_orgaos_distintos bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where data_criacao is not null and data_criacao < data_corte) as antes_corte,
    count(*) filter (where data_criacao is null) as sem_data,
    count(*) filter (where data_criacao >= data_corte) as apos_corte_total,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is not null) as apos_corte_vinculadas,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is null and numero_siafe is not null) as apos_corte_pendentes,
    count(*) filter (where data_criacao >= data_corte and numero_automatico is null and numero_siafe is null) as apos_corte_sem_numero,
    count(*) filter (where data_criacao >= data_corte and numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as apos_corte_dado_incorreto,
    count(distinct orgao) filter (where data_criacao >= data_corte) as apos_corte_orgaos_distintos
  from public.obras_visiveis obras;
$$;

create or replace function public.dashboard_gestao_top_orgaos(data_corte date default '2023-01-01', limite int default 3)
returns table (bucket text, orgao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  with linhas as (
    select
      orgao,
      (numero_automatico is not null) as eh_vinculada,
      (numero_automatico is null and numero_siafe is not null) as eh_pendente,
      (numero_automatico is null and numero_siafe is null) as eh_sem_numero,
      (numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as eh_dado_incorreto
    from public.obras_visiveis obras
    where orgao is not null and data_criacao >= data_corte
  ),
  contagens as (
    select 'vinculada' as bucket, orgao, count(*) as total from linhas where eh_vinculada group by orgao
    union all
    select 'pendente', orgao, count(*) from linhas where eh_pendente group by orgao
    union all
    select 'sem_numero', orgao, count(*) from linhas where eh_sem_numero group by orgao
    union all
    select 'dado_incorreto', orgao, count(*) from linhas where eh_dado_incorreto group by orgao
  ),
  ranqueado as (
    select bucket, orgao, total, row_number() over (partition by bucket order by total desc) as posicao
    from contagens
  )
  select bucket, orgao, total
  from ranqueado
  where posicao <= limite
  order by bucket, posicao;
$$;

create or replace function public.dashboard_status_acoes(
  data_corte date default '2023-01-01',
  limite int default 3
)
returns table (status text, total bigint, top_orgaos text[])
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select coalesce(nullif(trim(o.status), ''), 'Sem status') as status, o.orgao
    from public.obras_visiveis o
    where o.data_criacao >= data_corte
  ),
  por_status as (
    select b.status, count(*) as total from base b group by b.status
  ),
  por_orgao as (
    select
      b.status,
      b.orgao,
      row_number() over (partition by b.status order by count(*) desc, b.orgao) as rn
    from base b
    where b.orgao is not null
    group by b.status, b.orgao
  )
  select
    p.status,
    p.total,
    coalesce((select array_agg(po.orgao order by po.rn) from por_orgao po where po.status = p.status and po.rn <= limite), '{}')
  from por_status p
  order by p.total desc;
$$;

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
  select
    coalesce(r.responsavel_id, r.revisado_por, r.concluido_por) as usuario_id,
    'novas_acoes'::text as modulo,
    case
      when coalesce(r.concluido, false)
        or (r.kml_anexado = 'confirmado' and r.sem_duplicacao = 'confirmado' and r.documentos_obrigatorios = 'confirmado')
      then 'ok'
      else 'pendencia'
    end as situacao,
    count(*) as total
  from public.obras_revisao r
  left join public.obras_visiveis o on o.id_acao = r.id_acao
  where public.is_admin_aprovado(auth.uid())
    and coalesce(r.responsavel_id, r.revisado_por, r.concluido_por) is not null
    and (
      coalesce(r.concluido, false)
      or r.kml_anexado <> 'pendente'
      or r.sem_duplicacao <> 'pendente'
      or r.documentos_obrigatorios <> 'pendente'
    )
    -- ação excluída do SIMO: só fica o que já estava concluído
    and (
      o.id_acao is not null
      or coalesce(r.concluido, false)
      or (r.kml_anexado = 'confirmado' and r.sem_duplicacao = 'confirmado' and r.documentos_obrigatorios = 'confirmado')
    )
    and (data_de is null or (coalesce(r.concluido_em, r.revisado_em, r.atualizado_em) at time zone 'America/Fortaleza')::date >= data_de)
    and (data_ate is null or (coalesce(r.concluido_em, r.revisado_em, r.atualizado_em) at time zone 'America/Fortaleza')::date <= data_ate)
  group by 1, 3;
$$;

create or replace function public.kml_arquivos_resumo()
returns table (baixados bigint, sem_kml bigint, com_erro bigint, total_acoes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where k.situacao = 'baixado'),
    count(*) filter (where k.situacao = 'sem_kml'),
    count(*) filter (where k.situacao = 'erro'),
    (select count(*) from public.obras_visiveis obras)
  from public.kml_arquivos k
  where exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado');
$$;

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
  join public.obras_visiveis o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
  order by 3, r.encaminhada_em desc;
$$;

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
      from public.obras_visiveis o
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

create or replace function public.novas_acoes_orgaos(data_inicio date)
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_visiveis o
  where o.data_criacao >= data_inicio
    and coalesce(upper(o.acao_conveniada), '') not in ('FEDERAL', 'ESTADUAL')
    and o.orgao is not null
  order by o.orgao;
$$;

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
  left join public.obras_visiveis o on o.id_acao = r.id_acao
  left join public.profiles pe on pe.id = r.encaminhada_por
  left join public.profiles pr on pr.id = r.responsavel_id
  where r.encaminhada_em is not null
    and not coalesce(r.concluido, false)
    and exists (select 1 from public.profiles u where u.id = auth.uid() and u.status = 'aprovado')
  order by 3, r.encaminhada_em desc;
$$;

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
    left join public.obras_visiveis o on o.id_acao = e.id_acao
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

create or replace function public.obras_por_orgao()
returns table (orgao text, total bigint, vinculadas bigint, pendentes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(orgao, 'Sem órgão informado') as orgao,
    count(*) as total,
    count(*) filter (where numero_automatico is not null) as vinculadas,
    count(*) filter (where numero_automatico is null and numero_siafe is not null) as pendentes
  from public.obras_visiveis obras
  group by coalesce(orgao, 'Sem órgão informado')
  order by total desc;
$$;

create or replace function public.obras_resumo()
returns table (
  total bigint,
  vinculadas bigint,
  pendentes bigint,
  sem_numero bigint,
  dado_incorreto bigint,
  orgaos_distintos bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) as total,
    count(*) filter (where numero_automatico is not null) as vinculadas,
    count(*) filter (where numero_automatico is null and numero_siafe is not null) as pendentes,
    count(*) filter (where numero_automatico is null and numero_siafe is null) as sem_numero,
    count(*) filter (where numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as dado_incorreto,
    count(distinct orgao) as orgaos_distintos
  from public.obras_visiveis obras;
$$;

create or replace function public.obras_top_orgaos(bucket text, limite int default 3)
returns table (orgao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  select orgao, count(*) as total
  from public.obras_visiveis obras
  where orgao is not null
    and case bucket
      when 'sem_numero' then numero_automatico is null and numero_siafe is null
      when 'pendente' then numero_automatico is null and numero_siafe is not null
      when 'dado_incorreto' then numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$'
      when 'vinculada' then numero_automatico is not null
      else false
    end
  group by orgao
  order by total desc
  limit limite;
$$;

create or replace function public.obras_top_orgaos_todos(limite int default 3)
returns table (bucket text, orgao text, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  with linhas as (
    select
      orgao,
      (numero_automatico is not null) as eh_vinculada,
      (numero_automatico is null and numero_siafe is not null) as eh_pendente,
      (numero_automatico is null and numero_siafe is null) as eh_sem_numero,
      (numero_siafe is not null and numero_siafe !~ '^[0-9]{8}$') as eh_dado_incorreto
    from public.obras_visiveis obras
    where orgao is not null
  ),
  contagens as (
    select 'vinculada' as bucket, orgao, count(*) as total from linhas where eh_vinculada group by orgao
    union all
    select 'pendente', orgao, count(*) from linhas where eh_pendente group by orgao
    union all
    select 'sem_numero', orgao, count(*) from linhas where eh_sem_numero group by orgao
    union all
    select 'dado_incorreto', orgao, count(*) from linhas where eh_dado_incorreto group by orgao
  ),
  ranqueado as (
    select bucket, orgao, total, row_number() over (partition by bucket order by total desc) as posicao
    from contagens
  )
  select bucket, orgao, total
  from ranqueado
  where posicao <= limite
  order by bucket, posicao;
$$;

create or replace function public.sobreposicoes_atualizar_derivados()
returns int
language sql
security definer
set search_path = public
as $$
  with calc as (
    select
      s.chave_local,
      array(
        select distinct trim(e.value ->> 'orgao')
        from jsonb_array_elements(s.obras) e
        where coalesce(trim(e.value ->> 'orgao'), '') <> ''
      ) as orgaos,
      array(
        select distinct extract(year from o.data_criacao)::int
        from jsonb_array_elements(s.obras) e
        join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
        where o.data_criacao is not null
      ) as anos,
      -- Uma entrada por obra ('' quando a ação não está na base), igual aos filtros antigos.
      array(
        select upper(trim(coalesce(o.tipologia, '')))
        from jsonb_array_elements(s.obras) e
        left join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
      ) as tipologias,
      (
        jsonb_array_length(s.obras) > 0 and not exists (
          select 1
          from jsonb_array_elements(s.obras) e
          left join public.obras_visiveis o on o.id_acao = e.value ->> 'id'
          where coalesce(nullif(o.status, ''), e.value ->> 'status', '') not ilike 'conclu%'
        )
      ) as todas_concluidas
    from public.sobreposicoes s
    where jsonb_typeof(s.obras) = 'array'
  ),
  alterados as (
    update public.sobreposicoes s
    set d_orgaos = c.orgaos,
        d_anos = c.anos,
        d_tipologias = c.tipologias,
        d_todas_concluidas = c.todas_concluidas,
        d_todas_estrada_vicinal = ('ESTRADA VICINAL' = all(c.tipologias))
    from calc c
    where s.chave_local = c.chave_local
    returning 1
  )
  select count(*)::int from alterados;
$$;

create or replace function public.sobreposicoes_lista(
  filtro_status text default 'pendente',
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  pagina int default 1,
  tamanho int default 30,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null,
  grupo_situacao text default null
)
returns table (
  chave_local text,
  obras jsonb,
  qtd_obras int,
  extensao_m numeric,
  tolerancia_m int,
  qtd_segmentos int,
  lat_inicio numeric,
  lon_inicio numeric,
  lat_fim numeric,
  lon_fim numeric,
  status text,
  observacao text,
  importado_em timestamptz,
  responsavel_id uuid,
  responsavel_nome text,
  solucionado_por_nome text,
  solucionado_em timestamptz,
  solucao text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select s.chave_local, s.obras, s.qtd_obras, s.extensao_m, s.tolerancia_m, s.qtd_segmentos,
           s.lat_inicio, s.lon_inicio, s.lat_fim, s.lon_fim, s.status, s.observacao, s.importado_em,
           s.responsavel_id, s.solucionado_por, s.solucionado_em, s.solucao
    from public.sobreposicoes s
    where public.is_admin_aprovado(auth.uid())
      and s.status = coalesce(nullif(filtro_status, ''), 'pendente')
      and (coalesce(orgao_filtro, '') = '' or orgao_filtro = any(s.d_orgaos))
      and (ano_filtro is null or ano_filtro = any(s.d_anos))
      and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
      and (coalesce(tipologia_filtro, '') = '' or upper(trim(tipologia_filtro)) = any(s.d_tipologias))
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
      )
      and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas)
  ),
  pagina_atual as (
    select base.*, count(*) over() as total_geral
    from base
    order by base.extensao_m desc nulls last, base.chave_local
    limit tamanho offset (pagina - 1) * tamanho
  )
  select
    p.chave_local, p.obras, p.qtd_obras, p.extensao_m, p.tolerancia_m,
    p.qtd_segmentos, p.lat_inicio, p.lon_inicio, p.lat_fim, p.lon_fim,
    p.status, p.observacao, p.importado_em,
    p.responsavel_id, pr.nome, ps.nome, p.solucionado_em, p.solucao,
    p.total_geral
  from pagina_atual p
  left join public.profiles pr on pr.id = p.responsavel_id
  left join public.profiles ps on ps.id = p.solucionado_por
  order by p.extensao_m desc nulls last, p.chave_local;
$$;

create or replace function public.termos_contagens(
  tipo_filtro text default null,
  orgao_filtro text default null,
  data_de date default null,
  data_ate date default null,
  busca text default null
)
returns table (pendente bigint, corrigido bigint, problema bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where coalesce(r.status, 'pendente') = 'pendente'),
    count(*) filter (where r.status = 'corrigido'),
    count(*) filter (where r.status = 'problema')
  from public.obras_visiveis o
  left join public.obras_termos_revisao r on r.id_acao = o.id_acao
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and (
      tipo_filtro is null or tipo_filtro = ''
      or (tipo_filtro = 'tei' and o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%')
      or (tipo_filtro = 'rescisao' and o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    )
    and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
    and (data_de is null or o.data_criacao >= data_de)
    and (data_ate is null or o.data_criacao <= data_ate)
    and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%');
$$;

create or replace function public.termos_lista(
  filtro_status text default 'pendente',
  tipo_filtro text default null,
  orgao_filtro text default null,
  data_de date default null,
  data_ate date default null,
  busca text default null,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  data_recebimento date,
  tipo_recebimento text,
  tipo_documento text,
  numero_automatico text,
  status_revisao text,
  observacao text,
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
      coalesce(o.data_receb_definitivo, o.data_receb_provisorio) as data_recebimento,
      case when o.data_receb_definitivo is not null then 'definitivo' when o.data_receb_provisorio is not null then 'provisorio' end as tipo_recebimento,
      o.tipo_outros_documentos as tipo_documento,
      o.numero_automatico,
      coalesce(r.status, 'pendente') as status_revisao,
      r.observacao
    from public.obras_visiveis o
    left join public.obras_termos_revisao r on r.id_acao = o.id_acao
    where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
      and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
      and coalesce(r.status, 'pendente') = coalesce(nullif(filtro_status, ''), 'pendente')
      and (
        tipo_filtro is null or tipo_filtro = ''
        or (tipo_filtro = 'tei' and o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%')
        or (tipo_filtro = 'rescisao' and o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
      )
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
      and (data_de is null or o.data_criacao >= data_de)
      and (data_ate is null or o.data_criacao <= data_ate)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%')
  )
  select base.*, count(*) over() as total_geral
  from base
  order by data_criacao desc nulls last, case when id_acao ~ '^[0-9]+$' then id_acao::bigint end desc nulls last
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.termos_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_visiveis o
  where lower(coalesce(o.status, '')) in ('concluído', 'concluido')
    and (o.tipo_outros_documentos ilike 'TERMO DE ENCERRAMENTO POR INATIVIDADE%' or o.tipo_outros_documentos ilike 'TERMO DE RESCIS%')
    and o.orgao is not null
  order by 1;
$$;

create or replace function public.unidade_sugestao_anos()
returns table (ano int)
language sql
security definer
set search_path = public
stable
as $$
  select distinct extract(year from o.data_criacao)::int as ano
  from public.obras_unidade_sugestao s
  join public.obras_visiveis o on o.id_acao = s.id_acao
  where o.data_criacao is not null
  order by 1 desc;
$$;

create or replace function public.unidade_sugestao_lista(
  busca text default null,
  orgao_filtro text default null,
  confianca_filtro text default null,
  filtro_status text default 'pendentes',
  ano_minimo int default null,
  pagina int default 1,
  tamanho int default 50,
  tipologia_filtro text default null
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  tipologia text,
  status_acao text,
  unidade_atual text,
  quantidade_atual text,
  unidade_sugerida text,
  quantidade_sugerida text,
  sem_quantidade boolean,
  unidade_final text,
  quantidade_final text,
  confianca text,
  aviso_tipologia boolean,
  motivo text,
  aprovado boolean,
  aplicado_em timestamptz,
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
      o.tipologia,
      o.status as status_acao,
      s.unidade_atual,
      s.quantidade_atual,
      s.unidade_sugerida,
      s.quantidade_sugerida,
      s.sem_quantidade,
      s.unidade_final,
      s.quantidade_final,
      s.confianca,
      s.aviso_tipologia,
      s.motivo,
      s.aprovado,
      s.aplicado_em
    from public.obras_unidade_sugestao s
    join public.obras_visiveis o on o.id_acao = s.id_acao
    where (
      case filtro_status
        when 'aplicadas' then s.aplicado_em is not null
        when 'aprovadas' then s.aprovado = true and s.aplicado_em is null
        when 'todas' then true
        else s.aprovado = false and s.aplicado_em is null
      end
    )
      and (confianca_filtro is null or confianca_filtro = '' or s.confianca = confianca_filtro)
      and (ano_minimo is null or extract(year from o.data_criacao) >= ano_minimo)
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
      and (
        tipologia_filtro is null or tipologia_filtro = ''
        or (tipologia_filtro = '__sem__' and coalesce(trim(o.tipologia), '') = '')
        or trim(o.tipologia) = tipologia_filtro
      )
  )
  select base.*, count(*) over() as total_geral
  from base
  order by
    case when aplicado_em is not null then 2 when aprovado then 1 else 0 end,
    case when lower(coalesce(status_acao, '')) in ('concluído', 'concluido') then 1 else 0 end,
    case when id_acao ~ '^[0-9]+$' then id_acao::bigint end desc nulls last,
    id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.unidade_sugestao_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_unidade_sugestao s
  join public.obras_visiveis o on o.id_acao = s.id_acao
  where o.orgao is not null
  order by o.orgao;
$$;

create or replace function public.unidade_sugestao_tipologias()
returns table (tipologia text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(o.tipologia) as tipologia
  from public.obras_unidade_sugestao s
  join public.obras_visiveis o on o.id_acao = s.id_acao
  where coalesce(trim(o.tipologia), '') <> ''
  order by 1;
$$;

create or replace function public.vinculacao_lista(
  busca text default null,
  orgao_filtro text default null,
  pagina int default 1,
  tamanho int default 50
)
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  estagio_atual text,
  status text,
  numero_siafe text,
  situacao text,
  falhou_antes boolean,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with pendentes as (
    select
      o.id_acao,
      o.nome_acao,
      o.orgao,
      o.estagio_atual,
      o.status,
      o.numero_siafe,
      case
        when upper(coalesce(o.orgao, '')) = 'AGESPISA' then 'Órgão não possui SIAFE'
        when o.numero_siafe !~ '^[0-9]{8}$' then 'Formato inválido (não são 8 dígitos)'
        when o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe then o.vinculacao_ultimo_erro
        else null
      end as situacao,
      (o.vinculacao_ultimo_erro is not null and o.vinculacao_numero_tentado = o.numero_siafe) as falhou_antes
    from public.obras_visiveis o
    where o.numero_automatico is null
      and o.numero_siafe is not null
      and coalesce(lower(o.status), '') <> 'cancelado'
      and (busca is null or busca = '' or o.nome_acao ilike '%' || busca || '%' or o.id_acao ilike '%' || busca || '%' or o.orgao ilike '%' || busca || '%')
      and (orgao_filtro is null or orgao_filtro = '' or o.orgao = orgao_filtro)
  )
  select pendentes.*, count(*) over() as total_geral
  from pendentes
  order by (situacao is not null) desc, id_acao desc
  limit tamanho offset (pagina - 1) * tamanho;
$$;

create or replace function public.vinculacao_orgaos()
returns table (orgao text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct o.orgao
  from public.obras_visiveis o
  where o.numero_automatico is null
    and o.numero_siafe is not null
    and coalesce(lower(o.status), '') <> 'cancelado'
    and o.orgao is not null
  order by o.orgao;
$$;

-- Sobreposições: o local só vale com 2 ou mais ações não desconsideradas.

create or replace function public.sobreposicoes_lista(
  filtro_status text default 'pendente',
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  pagina int default 1,
  tamanho int default 30,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null,
  grupo_situacao text default null
)
returns table (
  chave_local text,
  obras jsonb,
  qtd_obras int,
  extensao_m numeric,
  tolerancia_m int,
  qtd_segmentos int,
  lat_inicio numeric,
  lon_inicio numeric,
  lat_fim numeric,
  lon_fim numeric,
  status text,
  observacao text,
  importado_em timestamptz,
  responsavel_id uuid,
  responsavel_nome text,
  solucionado_por_nome text,
  solucionado_em timestamptz,
  solucao text,
  total_geral bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select s.chave_local, s.obras, s.qtd_obras, s.extensao_m, s.tolerancia_m, s.qtd_segmentos,
           s.lat_inicio, s.lon_inicio, s.lat_fim, s.lon_fim, s.status, s.observacao, s.importado_em,
           s.responsavel_id, s.solucionado_por, s.solucionado_em, s.solucao
    from public.sobreposicoes s
    where public.is_admin_aprovado(auth.uid())
      and jsonb_array_length(public.sobreposicao_obras_ativas(s.obras)) >= 2
      and s.status = coalesce(nullif(filtro_status, ''), 'pendente')
      and (coalesce(orgao_filtro, '') = '' or orgao_filtro = any(s.d_orgaos))
      and (ano_filtro is null or ano_filtro = any(s.d_anos))
      and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
      and (coalesce(tipologia_filtro, '') = '' or upper(trim(tipologia_filtro)) = any(s.d_tipologias))
      and (
        coalesce(tipologia_todas_filtro, '') = ''
        or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
      )
      and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas)
  ),
  pagina_atual as (
    select base.*, count(*) over() as total_geral
    from base
    order by base.extensao_m desc nulls last, base.chave_local
    limit tamanho offset (pagina - 1) * tamanho
  )
  select
    p.chave_local, public.sobreposicao_obras_ativas(p.obras), jsonb_array_length(public.sobreposicao_obras_ativas(p.obras)), p.extensao_m, p.tolerancia_m,
    p.qtd_segmentos, p.lat_inicio, p.lon_inicio, p.lat_fim, p.lon_fim,
    p.status, p.observacao, p.importado_em,
    p.responsavel_id, pr.nome, ps.nome, p.solucionado_em, p.solucao,
    p.total_geral
  from pagina_atual p
  left join public.profiles pr on pr.id = p.responsavel_id
  left join public.profiles ps on ps.id = p.solucionado_por
  order by p.extensao_m desc nulls last, p.chave_local;
$$;

create or replace function public.sobreposicoes_contagens(
  orgao_filtro text default null,
  ano_filtro int default null,
  ocultar_estrada_vicinal boolean default false,
  tipologia_filtro text default null,
  tipologia_todas_filtro text default null,
  grupo_situacao text default null
)
returns table (pendente bigint, ok bigint, problema bigint, solucionado bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where s.status = 'pendente'),
    count(*) filter (where s.status = 'ok'),
    count(*) filter (where s.status = 'problema'),
    count(*) filter (where s.status = 'solucionado')
  from public.sobreposicoes s
  where public.is_admin_aprovado(auth.uid())
    and jsonb_array_length(public.sobreposicao_obras_ativas(s.obras)) >= 2
    and (coalesce(orgao_filtro, '') = '' or orgao_filtro = any(s.d_orgaos))
    and (ano_filtro is null or ano_filtro = any(s.d_anos))
    and (not ocultar_estrada_vicinal or not s.d_todas_estrada_vicinal)
    and (coalesce(tipologia_filtro, '') = '' or upper(trim(tipologia_filtro)) = any(s.d_tipologias))
    and (
      coalesce(tipologia_todas_filtro, '') = ''
      or (cardinality(s.d_tipologias) > 0 and upper(trim(tipologia_todas_filtro)) = all(s.d_tipologias))
    )
    and (coalesce(grupo_situacao, '') = '' or (grupo_situacao = 'concluidas') = s.d_todas_concluidas);
$$;

create or replace function public.contar_sobreposicoes_pendentes()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.sobreposicoes s
  where s.status = 'pendente' and jsonb_array_length(public.sobreposicao_obras_ativas(s.obras)) >= 2;
$$;

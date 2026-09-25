-- "Trecho único" saiu do checklist de Novas Ações (a coluna continua em
-- obras_revisao, só deixa de valer). Sem isto, uma ação com os outros 3
-- itens confirmados continuaria contando como pendente no menu.

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
    and (
      r.kml_anexado = 'aguardando_atualizacao'
      or r.sem_duplicacao = 'aguardando_atualizacao'
      or r.documentos_obrigatorios = 'aguardando_atualizacao'
    );
$$;

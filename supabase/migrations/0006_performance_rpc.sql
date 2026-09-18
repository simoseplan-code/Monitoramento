-- Conta as "Novas Ações" pendentes de revisão direto no Postgres (um só
-- round-trip, sem trazer linha nenhuma pro Next.js) — essa contagem
-- roda em toda página do app (badge do menu lateral), então importa
-- ser barata.
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
      or coalesce(r.trecho_unico, 'pendente') <> 'confirmado'
      or coalesce(r.documentos_obrigatorios, 'pendente') <> 'confirmado'
    );
$$;

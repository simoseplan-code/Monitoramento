-- Pendência de ação que sumiu do SIMO (foi excluída) não pode continuar
-- contando no Desempenho — ninguém consegue mais ver nem resolver. A análise
-- já CONCLUÍDA dessa ação continua creditada a quem fez.
-- Ação existente: igual antes (concluída = ok, o resto = pendência).

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
  left join public.obras o on o.id_acao = r.id_acao
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

-- Ação que some do SIMO (excluída) com análise de Novas Ações pendente não pode
-- simplesmente desaparecer: passa a constar como "ação excluída" até alguém dar
-- baixa. O nome/órgão/data são guardados na hora em que a ação some (gatilho),
-- porque depois não existe mais a linha em obras pra consultar.

alter table public.obras_revisao
  add column if not exists nome_acao text,
  add column if not exists orgao text,
  add column if not exists data_criacao date,
  add column if not exists excluida_em timestamptz,
  add column if not exists baixa_excluida_em timestamptz,
  add column if not exists baixa_excluida_por uuid references public.profiles(id);

-- Foto do que existe hoje (pra já ter o nome quando a ação sumir).
update public.obras_revisao r
set nome_acao = o.nome_acao, orgao = o.orgao, data_criacao = o.data_criacao
from public.obras o
where o.id_acao = r.id_acao and r.nome_acao is null;

-- O que já sumiu antes desta migration (nome não foi guardado).
update public.obras_revisao r
set excluida_em = now()
where r.excluida_em is null
  and not exists (select 1 from public.obras o where o.id_acao = r.id_acao);

create or replace function public.guardar_revisao_ao_excluir_obra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.obras_revisao
  set nome_acao = old.nome_acao, orgao = old.orgao, data_criacao = old.data_criacao, excluida_em = now()
  where id_acao = old.id_acao;
  return old;
end;
$$;

drop trigger if exists obras_guardar_revisao_ao_excluir on public.obras;
create trigger obras_guardar_revisao_ao_excluir
  before delete on public.obras
  for each row execute function public.guardar_revisao_ao_excluir_obra();

-- Se a ação voltar a aparecer no relatório do SIMO, deixa de ser "excluída".
create or replace function public.limpar_exclusao_ao_reaparecer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.obras_revisao
  set excluida_em = null, baixa_excluida_em = null, baixa_excluida_por = null
  where id_acao = new.id_acao and excluida_em is not null;
  return new;
end;
$$;

drop trigger if exists obras_limpar_exclusao_ao_reaparecer on public.obras;
create trigger obras_limpar_exclusao_ao_reaparecer
  after insert on public.obras
  for each row execute function public.limpar_exclusao_ao_reaparecer();

-- Lista pra tela de Novas Ações: excluídas, não concluídas e sem baixa.
create or replace function public.novas_acoes_excluidas()
returns table (
  id_acao text,
  nome_acao text,
  orgao text,
  data_criacao date,
  kml_anexado text,
  sem_duplicacao text,
  documentos_obrigatorios text,
  excluida_em timestamptz,
  responsavel_id uuid,
  responsavel_nome text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id_acao, r.nome_acao, r.orgao, r.data_criacao,
         r.kml_anexado, r.sem_duplicacao, r.documentos_obrigatorios,
         r.excluida_em, r.responsavel_id, p.nome
  from public.obras_revisao r
  left join public.profiles p on p.id = r.responsavel_id
  where r.excluida_em is not null
    and r.baixa_excluida_em is null
    and not coalesce(r.concluido, false)
  order by r.excluida_em desc;
$$;

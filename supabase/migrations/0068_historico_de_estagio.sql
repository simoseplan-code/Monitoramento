-- Histórico de estágio de cada ação: toda vez que a sincronização com o SIMO muda o
-- estágio de uma ação (ou traz uma ação nova), a mudança é gravada aqui. É daí que sai a
-- fila de "novas em execução" (o que virou EM EXECUÇÃO desde a sincronização anterior).
--
-- Só grava a partir de agora: na primeira sincronização depois deste SQL nada é
-- registrado para ações que já existiam sem mudar de estágio, então hoje a lista nasce
-- vazia e amanhã mostra o que virou em execução hoje.
-- Guarda só o ID e fotos de nome/órgão (sem FK), como as outras análises: o registro
-- sobrevive se a ação sumir do SIMO.

create table if not exists public.obras_estagio_log (
  id bigint generated always as identity primary key,
  id_acao text not null,
  nome_acao text,
  orgao text,
  estagio_anterior text,
  estagio_novo text,
  detectado_em timestamptz not null default now(),
  -- Dia (em Fortaleza) da sincronização que percebeu a mudança.
  dia date not null default ((now() at time zone 'America/Fortaleza')::date)
);

create index if not exists obras_estagio_log_acao_idx on public.obras_estagio_log (id_acao, detectado_em desc);
create index if not exists obras_estagio_log_dia_idx on public.obras_estagio_log (dia);

alter table public.obras_estagio_log enable row level security;

drop policy if exists "equipe aprovada le historico de estagio" on public.obras_estagio_log;
create policy "equipe aprovada le historico de estagio"
  on public.obras_estagio_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));
-- Sem policy de escrita: só o gatilho abaixo (e o servidor) gravam.

create or replace function public.registrar_mudanca_de_estagio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.obras_estagio_log (id_acao, nome_acao, orgao, estagio_anterior, estagio_novo)
    values (new.id_acao, new.nome_acao, new.orgao, null, new.estagio_atual);
  elsif new.estagio_atual is distinct from old.estagio_atual then
    insert into public.obras_estagio_log (id_acao, nome_acao, orgao, estagio_anterior, estagio_novo)
    values (new.id_acao, new.nome_acao, new.orgao, old.estagio_atual, new.estagio_atual);
  end if;
  return new;
end;
$$;

drop trigger if exists obras_registrar_estagio_ins on public.obras;
create trigger obras_registrar_estagio_ins
  after insert on public.obras
  for each row execute function public.registrar_mudanca_de_estagio();

drop trigger if exists obras_registrar_estagio_upd on public.obras;
create trigger obras_registrar_estagio_upd
  after update of estagio_atual on public.obras
  for each row
  when (old.estagio_atual is distinct from new.estagio_atual)
  execute function public.registrar_mudanca_de_estagio();

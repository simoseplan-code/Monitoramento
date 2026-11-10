-- MEDIÇÕES (BOLETINS DE MEDIÇÃO LIDOS DO SIMO)
--
-- A tela "Compatibilização de medições" guarda aqui uma cópia dos boletins de medição que o SIMO mostra na aba
-- "Boletins de medição" de cada ação. O painel lê o SIMO (somente leitura) e grava aqui; a tela lê só daqui.
--
--  medicoes_simo     = um boletim (número, data, tipo, responsável, órgão, valor)
--  medicoes_leitura  = quando cada ação foi lida (e se deu erro), mesmo as que não têm boletim nenhum
--
-- Só o servidor (chave de serviço) grava; a equipe aprovada lê.

create table if not exists public.medicoes_simo (
  id_acao text not null,
  id_simo text not null,             -- ID interno do boletim no SIMO
  numero text,
  data date,
  tipo text,
  responsavel text,
  orgao text,
  valor numeric(16,2) not null default 0,
  lido_em timestamptz not null default now(),
  primary key (id_acao, id_simo)
);
create index if not exists medicoes_simo_data_idx on public.medicoes_simo (data);

create table if not exists public.medicoes_leitura (
  id_acao text primary key,
  lido_em timestamptz not null default now(),
  qtd_boletins integer not null default 0,
  erro text
);

alter table public.medicoes_simo enable row level security;
alter table public.medicoes_leitura enable row level security;

drop policy if exists "equipe aprovada le medicoes_simo" on public.medicoes_simo;
create policy "equipe aprovada le medicoes_simo"
  on public.medicoes_simo for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

drop policy if exists "equipe aprovada le medicoes_leitura" on public.medicoes_leitura;
create policy "equipe aprovada le medicoes_leitura"
  on public.medicoes_leitura for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado'));

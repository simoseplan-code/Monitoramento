-- Ponte entre as camadas do sync: a camada 1 baixa o relatório do SIMO (a
-- parte lenta) e guarda aqui, compactado; a camada 2 lê daqui e grava as
-- obras. Assim o download tem o tempo inteiro da requisição pra ele e a
-- gravação não depende do SIMO estar rápido. Só fica o último arquivo.
create table public.sync_csv (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  csv_gzip_b64 text not null,
  bytes_originais int
);

-- Sem nenhuma policy de propósito: só o service_role (rotas de sync) lê e
-- escreve. O CSV tem a base inteira de ações.
alter table public.sync_csv enable row level security;

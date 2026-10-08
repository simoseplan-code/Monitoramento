-- Senha resetada pelo administrador: a pessoa entra com a senha provisória e é
-- obrigada a cadastrar uma nova antes de usar o painel. Só o servidor (service_role)
-- liga/desliga esta marca; usuário comum não atualiza o próprio perfil (RLS).
alter table public.profiles
  add column if not exists trocar_senha boolean not null default false;

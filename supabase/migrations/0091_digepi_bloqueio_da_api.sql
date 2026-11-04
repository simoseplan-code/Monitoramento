-- REFORÇO DE SEGURANÇA da função DIGEPI (opcional, mas recomendado). Rode DEPOIS da 0090, em horário calmo.
--
-- Por que existe: as telas e APIs do painel já barram a pessoa DIGEPI (status 'digepi'), e as tabelas também (as
-- regras do banco exigem status 'aprovado'). Mas algumas funções do banco (as que o painel chama com rpc) rodam com
-- permissão de sistema e não olham quem chamou: uma pessoa DIGEPI com a sessão aberta poderia chamá-las direto pela
-- API do Supabase, fora do painel, e ler dados de ações.
--
-- O que faz: antes de QUALQUER pedido à API do banco feito por uma pessoa DIGEPI, esta regra recusa, exceto a leitura
-- do próprio perfil (que o painel precisa para saber quem é). O Mapa de Recursos Hídricos lê tudo pelo servidor, então
-- não é afetado. Quem não é DIGEPI (e o servidor do painel) passa direto, com uma consulta rápida pela chave primária.
--
-- COMO DESFAZER (se algo estranho aparecer, rode esta linha e tudo volta ao normal na hora):
--   alter role authenticator reset pgrst.db_pre_request;  notify pgrst, 'reload config';

create or replace function public.bloquear_digepi()
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return; -- servidor do painel (chave de serviço) ou pedido sem sessão: as regras normais cuidam
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.status = 'digepi')
     and coalesce(current_setting('request.path', true), '') !~ '^/profiles' then
    raise exception 'Acesso restrito ao Mapa de Recursos Hídricos.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.bloquear_digepi() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.bloquear_digepi';
notify pgrst, 'reload config';

-- SEGURANÇA — etapa 2: funções do banco fechadas para quem não está logado.
--
-- Problema: o Supabase libera, por padrão, EXECUTE de toda função do schema
-- public para "anon" (a chave pública que vai no navegador). As ~40 funções
-- "security definer" do painel (listas, contagens, dashboards...) passam por
-- cima das regras de linha (RLS) e não conferem quem está chamando — então
-- qualquer pessoa na internet, sem login, conseguiria chamá-las direto pela API.
--
-- Correção: tira o acesso de "public" e "anon"; só pessoas logadas
-- (authenticated) e o servidor (service_role) executam. As funções novas que
-- forem criadas daqui pra frente já nascem assim.

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

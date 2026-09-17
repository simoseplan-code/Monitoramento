-- Rode isto DEPOIS de ativar a extensão pg_cron em
-- Database → Extensions no painel do Supabase.
create extension if not exists pg_cron;

select cron.schedule(
  'limpa-rate-limit',
  '0 3 * * *',
  $$ delete from public.rate_limit_hits where criado_em < now() - interval '1 day'; $$
);

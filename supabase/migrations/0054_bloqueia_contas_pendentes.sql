-- SEGURANÇA — etapa 2b: quem ainda não foi aprovado (ou foi rejeitado) fica
-- BLOQUEADO no Supabase Auth, então não consegue sessão nem chamar a API do banco.
-- Daqui pra frente o cadastro já nasce bloqueado e o admin libera ao aprovar
-- (app/api/auth/signup e app/api/admin/approve). Isto cobre quem já existe.
-- Quem está aprovado não é tocado.

update auth.users u
set banned_until = now() + interval '100 years'
from public.profiles p
where p.id = u.id
  and p.status in ('pendente', 'rejeitado');

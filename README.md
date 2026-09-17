# Monitoramento de Obras

Painel interno da equipe para acompanhar ações/obras e a vinculação de contratos no SIAFE, com dados sincronizados automaticamente do SIMO.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth + Postgres + RLS)
- Vercel (deploy + Cron)

## Setup

### 1. Supabase
1. No projeto `lqvxsxlemdvedxhfnnwv`, abra o **SQL Editor** e rode, nesta ordem:
   - `supabase/migrations/0001_init.sql`
   - Ative a extensão `pg_cron` em **Database → Extensions**, depois rode `supabase/migrations/0002_pg_cron.sql`.
   - `supabase/migrations/0003_fix_profiles_rls_recursion.sql` (corrige recursão infinita nas policies de admin de `profiles`).
2. Em **Authentication → Providers**, confirme que Email está ativo e **Confirm email desligado** (a identidade é validada pela aprovação manual do admin, não por e-mail).
3. Em **Authentication → Attack Protection**, ligue **Leaked password protection**.
4. Copie de **Settings → API**: `Project URL`, `anon public key` e `service_role key`.

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SIMO_LOGIN` / `SIMO_SENHA` — mesmas credenciais usadas hoje na automação da planilha
- `CRON_SECRET` — gere um valor aleatório (`openssl rand -hex 32`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — opcional em dev (crie um widget no Cloudflare Turnstile para produção)

Configure as mesmas variáveis em **Vercel → Settings → Environment Variables** (Production).

### 3. Criar o primeiro admin
1. Cadastre-se normalmente pela tela `/cadastro`.
2. No SQL Editor do Supabase, rode:
   ```sql
   update public.profiles set status = 'aprovado', is_admin = true where email = 'seu-email@exemplo.com';
   ```
3. A partir daí, aprovações seguintes podem ser feitas pela própria tela `/admin`.

### 4. Rodar local
```bash
npm install
npm run dev
```

### 5. Deploy
```bash
git push origin main
```
Conecte o repositório ao projeto Vercel (`simoseplan-5337`) — o `vercel.json` já configura o cron diário (10:00 UTC = 07:00 em Teresina) que chama `/api/cron/sync-simo`.

## Como funciona a sincronização com o SIMO
A rota `app/api/cron/sync-simo/route.ts` reproduz o que a automação de Google Sheets já fazia:
1. Login no SIMO (`SIMO_LOGIN`/`SIMO_SENHA`) para obter um cookie de sessão.
2. "Roda" o relatório "AUTOMAÇÃO CONTRATO SIAFE" (id `1740`) no SIMO.
3. Baixa o CSV exportado (decodificando Latin-1 e descomprimindo gzip se necessário).
4. Faz o parse do CSV **pelo nome das colunas**, não pela posição — se o SIMO adicionar colunas novas no relatório, elas caem automaticamente na coluna `extra` (jsonb) da tabela `obras` em vez de quebrar o sync. Para promover uma coluna nova a campo de verdade, edite `HEADER_MAP`/`HEADER_MAP_OPCIONAL` em `lib/simo/parseCsv.ts` e adicione a coluna correspondente na migration.
5. Faz upsert em `public.obras` (chave `id_acao`) e apaga ações que sumiram do relatório.
6. Grava um retrato do dia em `obras_historico` e o resultado da execução em `sync_log`.

Um admin também pode disparar a sincronização manualmente pela tela `/admin` (botão "Sincronizar agora"), sem esperar o cron diário.

## Segurança (mesmo padrão da Frente Limma)
- RLS ligada em todas as tabelas; só `service_role` escreve em `obras`/`obras_historico`/`sync_log`.
- Rate limit por IP em `/api/auth/login` (10/10min) e `/api/auth/signup` (5/10min).
- Lockout de 15 min após 5 senhas erradas seguidas.
- Cadastro aberto, mas cada conta nasce com `status = 'pendente'` — só acessa o painel depois de um admin aprovar.
- Captcha (Cloudflare Turnstile) em login e cadastro.

import { createClient } from "@supabase/supabase-js";

// Cliente com service_role — só pode ser importado em código de
// servidor (rotas de API, nunca em "use client"). Ignora RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

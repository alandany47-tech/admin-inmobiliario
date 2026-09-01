import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la service role key (bypassa RLS por completo).
 * Solo usar desde Server Actions que ya validaron `rol === 'ADMIN'` a mano
 * (esta key no respeta las policies de RLS, así que la validación de
 * permisos es responsabilidad exclusiva del caller). Nunca importar desde
 * un Client Component ni exponer esta key con prefijo NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Supabase Dashboard → Settings → API → service_role)."
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

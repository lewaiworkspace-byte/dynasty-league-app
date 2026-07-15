import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY. Uses the service_role key, which bypasses all security rules.
// This file must never be imported into a 'use client' component -- only
// into Server Actions or Route Handlers. The key itself lives in Vercel's
// environment variables (no NEXT_PUBLIC_ prefix), never in this file.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

import { createClient } from '@supabase/supabase-js';

// These come from Vercel's Environment Variables (set in the Vercel
// dashboard, not written here) -- see the setup instructions.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

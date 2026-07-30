import { createBrowserClient } from '@supabase/ssr'

// Session-aware browser client: reads and writes the Supabase auth cookie,
// so client components see who's logged in. Exported as `supabase`, the
// same name the whole app imports.
//
// In practice this is still read-only -- RLS allows public SELECT and no
// write policies exist for the anon key. Writes go through Server Actions
// using lib/supabaseAdmin.js's adminClient(), except bid submission, which
// needs the caller's own session (see app/bids/actions.js).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

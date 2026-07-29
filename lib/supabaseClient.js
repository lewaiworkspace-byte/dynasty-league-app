import { createBrowserClient } from '@supabase/ssr'

// This REPLACES lib/supabaseClient.js's current contents (a plain
// supabase-js client with no @supabase/ssr dependency, per Claude Code's
// direct check of origin/main). Export name (`supabase`) is unchanged, so
// nothing importing it needs to be touched -- only the internals change,
// to make the browser client cookie/session-aware.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

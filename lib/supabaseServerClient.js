import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Use this inside Server Components and Server Actions when code needs to
// know who's logged in and query as that specific user (RLS applies as
// them). This is NOT a replacement for lib/supabaseAdmin.js -- that one
// still bypasses RLS for admin writes via its adminClient() factory, and
// stays exactly as it is.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a context where cookies can't be written (e.g.
            // a Server Component during static rendering). Safe to ignore
            // -- middleware.js handles session refresh on the request.
          }
        },
      },
    }
  )
}

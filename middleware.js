import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

/**
 * SESSION REFRESH, AND -- from September 17, 2026 -- THE FRONT DOOR.
 *
 * COMMISSIONER RULING R-7: the app has no public face. Every page requires a
 * session; the login page is the only thing a signed-out visitor can reach.
 *
 * WHY THE GATE LIVES HERE AND NOT IN FORTY-FIVE PAGE FILES. Twenty pages
 * already redirected a signed-out visitor to /login?next=... and twenty-five
 * did not, because they read through the anon client and rendered for anyone.
 * Adding the redirect to those twenty-five would be twenty-five chances to
 * miss one, and the next page anybody adds would be the twenty-sixth. One
 * gate, one allowlist, and a new page is closed by default.
 *
 * THE PER-PAGE REDIRECTS STAY. They cost nothing, they keep each page honest
 * about what it needs, and they are the second line if this file is ever
 * edited carelessly. Belt and braces is the right posture for the front door.
 *
 * THIS IS NOT THE WHOLE OF R-7. The eleven pages that still read through the
 * anon (browser) client keep working because they are now only ever rendered
 * for a signed-in visitor -- but the anon GRANTS behind them are still open,
 * and anyone holding the publishable key can still read those views directly,
 * outside the app. Closing that is phase 1B, in this order and no other:
 *   1. flip those eleven pages to the session server client,
 *   2. deploy and confirm every page still renders signed in,
 *   3. revoke the anon grants.
 * Revoking first would blank eleven pages for everyone.
 *
 * WHAT IS ALLOWLISTED, and why each one:
 *   /login          the destination. Redirecting it to itself is a loop.
 *   /auth/callback  where the emailed code lands. Gating it means nobody can
 *                   ever sign in, because the session does not exist yet at
 *                   the moment this route runs.
 *   /api/cron/*     Vercel calls these on a schedule with no cookie. Gating
 *                   them silently breaks the injury sync -- it would answer
 *                   307 to the scheduler and nobody would notice until a
 *                   Sunday.
 * Static assets and Next internals are excluded by the matcher below, as
 * before. The two export routes (/injury-report/export and the tier results
 * export) are deliberately NOT allowlisted: they are owner-triggered
 * downloads and should require a session like everything else.
 */

const PUBLIC_PREFIXES = ['/login', '/auth/callback', '/api/cron']

function isPublic(pathname) {
  for (let i = 0; i < PUBLIC_PREFIXES.length; i++) {
    const p = PUBLIC_PREFIXES[i]
    if (pathname === p || pathname.indexOf(p + '/') === 0) return true
  }
  return false
}

export async function middleware(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touching auth.getUser() here is what actually refreshes the session
  // cookie when it's close to expiring -- Server Components can't set
  // cookies themselves, so this is the one place it can reliably happen.
  // Its RESULT is now also the gate, so the call does two jobs and the
  // request still makes exactly one trip to Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // Same ?next= contract the twenty gated pages already use. The login page
    // reads it and lib/safeNext.js validates it before anything redirects, so
    // a hostile next= collapses to '/' rather than leaving the site.
    url.searchParams.set('next', pathname + (request.nextUrl.search || ''))
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

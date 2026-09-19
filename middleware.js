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
 *   /install        Added September 19, 2026 (phase 2F). How to put the app on
 *                   a phone. An owner who has not signed in yet is exactly the
 *                   person who needs it, and the QR code in Discord points
 *                   here. app/install/page.js reads NOTHING -- no database, no
 *                   session, no league state -- and its header says so. If it
 *                   ever starts reading something, this entry is a hole.
 * Static assets and Next internals are excluded by the matcher below, as
 * before. The two export routes (/injury-report/export and the tier results
 * export) are deliberately NOT allowlisted: they are owner-triggered
 * downloads and should require a session like everything else.
 *
 * *** THREE FILES HAD TO BE ALLOWLISTED TOO, AND THIS IS THE PART THAT WOULD
 *     HAVE FAILED SILENTLY *** (phase 2F, September 19, 2026)
 *
 * The matcher below excludes svg|png|jpg|jpeg|gif|webp and favicon.ico, so the
 * icon set is already served without touching this gate. THE MANIFEST AND THE
 * SERVICE WORKER ARE NOT, because neither ends in one of those extensions --
 * and both are fetched by the browser WITHOUT COOKIES, before and outside any
 * session. Left gated, each answers 307 to /login:
 *
 *   /manifest.webmanifest  the browser gets HTML where it expects JSON, the
 *                          manifest fails to parse, and NO INSTALL PROMPT EVER
 *                          APPEARS ON ANY DEVICE. Nothing logs an error. The
 *                          whole phase would ship and do nothing.
 *   /sw.js                 registration is rejected for a bad MIME type, so no
 *                          offline card and no cached shell.
 *   /offline.html          the one page that renders when there is no network;
 *                          a redirect to /login is exactly what it exists to
 *                          avoid.
 *
 * These are EXACT matches, not prefixes: nothing under a directory is opened,
 * and all three are static files in public/ that read nothing.
 *
 * *** EDITING EITHER LIST IS NOT A SMALL CHANGE. *** Thirteen page routes have
 * no gate of their own and depend on this file alone. Adding an entry opens
 * exactly what it names; REMOVING the wrong one, or widening an entry into a
 * prefix, un-gates pages with nothing behind them.
 */

const PUBLIC_PREFIXES = ['/login', '/auth/callback', '/api/cron', '/install']

const PUBLIC_FILES = ['/manifest.webmanifest', '/sw.js', '/offline.html']

function isPublic(pathname) {
  for (let i = 0; i < PUBLIC_FILES.length; i++) {
    if (pathname === PUBLIC_FILES[i]) return true
  }
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

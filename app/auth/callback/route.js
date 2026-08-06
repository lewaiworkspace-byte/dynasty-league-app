import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient'
import { safeNext } from '../../../lib/safeNext'

// The login flow no longer reaches this route -- it verifies a 6-digit
// code in the page rather than following a link. Kept anyway: any magic
// link already sitting in an owner's inbox from before the switch still
// lands here, and other Supabase flows may use it later.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // safeNext() also covers the missing-parameter case, returning '/' for
  // the null that searchParams.get() hands back.
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(origin + next)
    }
  }

  // Bad or expired link -- send them back to try again.
  return NextResponse.redirect(origin + '/login?error=auth')
}

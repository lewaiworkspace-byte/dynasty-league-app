import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Bad or expired link -- send them back to try again.
  return NextResponse.redirect(`${origin}/login?error=auth`)
}

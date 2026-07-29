import { createSupabaseServerClient } from './supabaseServerClient'

/**
 * Returns the currently logged-in team_owners row
 * ({ id, team_id, email, is_commissioner }), or null if nobody's logged in
 * or their login isn't linked to a team yet. Use this in Server Components
 * and Server Actions to find out who's asking.
 */
export async function getCurrentTeamOwner() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: teamOwner, error } = await supabase
    .from('team_owners')
    .select('id, team_id, email, is_commissioner')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Error loading team_owners row:', error)
    return null
  }

  return teamOwner
}

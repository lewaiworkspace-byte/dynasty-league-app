import { createSupabaseServerClient } from './supabaseServerClient'

/**
 * Returns the currently logged-in team_owners row
 * ({ id, team_id, email, is_commissioner, is_co_commissioner }), or null if
 * nobody's logged in or their login isn't linked to a team yet. Use this in
 * Server Components and Server Actions to find out who's asking.
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
    .select('id, team_id, email, is_commissioner, is_co_commissioner')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Error loading team_owners row:', error)
    return null
  }

  return teamOwner
}

// TWO GATES, AND THE DIFFERENCE IS DELIBERATE (August 25, 2026).
//
// is_commissioner means the commissioner and nobody else. It did not change
// meaning when the co-commissioner role arrived, and it must not: two admin
// pages and several capabilities still depend on the strict reading.
//
// STRICT (test me.is_commissioner directly, do NOT use the helper below):
//   /admin/sync-players
//   /admin/import-stats
//   /admin/owner-activity        -- commissioner_owner_activity() gates on
//                                   require_commissioner() internally, so a
//                                   widened page would load and then refuse
//   appointing a co-commissioner  -- set_co_commissioner() is commissioner-only
//   publishing a Player Value Chart snapshot, mapping a chart name to a
//   player, and any view of unpublished snapshots or the chart name map
//   (all database-side; no app surface exists for them)
//
// WIDENED (use isCommissionerOrCo):
//   /admin/tier-results  /admin/cuts  /admin/new-tier
//   /admin/new-contract  /admin/fix-contracts  /admin/cash
//   plus canCut on /team/[teamId], which is how a cut from another team's
//   roster is actually reached
//
// The default is DENY. Anything new stays commissioner-only until somebody
// widens it on purpose, which is why this is a second helper rather than a
// change to the meaning of the first one. The database mirrors the same
// split: is_commissioner()/require_commissioner() are unchanged and strict;
// is_commissioner_or_co()/require_commissioner_or_co() are the widened pair.

/**
 * True when this team_owners row is the commissioner OR a co-commissioner.
 *
 * A pure predicate over a row that has already been fetched -- it does not
 * query, so a page and its Server Action can each call it on the row they
 * already hold without a second round trip. Null-safe: a signed-out caller
 * (null) is false, never a crash.
 *
 * Mirrors is_commissioner_or_co(uuid) in the database. The database is still
 * the real gate; this decides what gets drawn and produces a readable refusal.
 *
 * @param {{is_commissioner?: boolean, is_co_commissioner?: boolean}|null} teamOwner
 * @returns {boolean}
 */
export function isCommissionerOrCo(teamOwner) {
  if (!teamOwner) return false
  return Boolean(teamOwner.is_commissioner || teamOwner.is_co_commissioner)
}

// The message the database raises from require_commissioner_or_co(). Shared
// so a client-side refusal and a database refusal read identically -- an
// owner should not be able to tell which layer stopped them.
export const COMMISSIONER_OR_CO_REFUSAL =
  'This action requires commissioner or co-commissioner access.'

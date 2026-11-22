'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

// THE WATCHLIST TOGGLE -- UI test batch 21, November 15, 2026.
//
// Lewis on the Players canvas: "Add a Watchlist icon here on every view in
// this section ... Remove the green check mark in the clipboard and make the
// clipboard more faint. This will be the default. When a owner wants to add a
// player to their watchlist, they click the icon and it looks like what it
// looks like now with the green checkmark and non-faint color. We will build a
// watchlist page in a later chat."
//
// THE DATABASE IS THE GATE. edfl_watchlist_toggle() (test migration
// players_a_05) resolves the team from auth.uid(), refuses a login with no
// team ("Only a team owner can keep a watchlist.") and an unknown player, and
// flips the row: one watchlist per team. So this runs on the SESSION client,
// never adminClient() -- through the service role auth.uid() is NULL and every
// call would be refused.
//
// UI TEST BATCH 22 (November 15, 2026): the same function now writes Rule
// 7.9's watchlist_markers (test migration watchlist_01): adding makes a
// private marker, taking off removes it, and the Watchlist tab lists them.
//
// THE REFUSAL IS RETURNED, NEVER THROWN (ground rule 9): Next.js masks anything
// thrown out of a Server Action in a production build.

export async function toggleWatchlist(playerId) {
  if (typeof playerId !== 'string' || !playerId) {
    return { ok: false, message: 'That player was not found.' };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('edfl_watchlist_toggle', { p_player_id: playerId });
    if (error) return { ok: false, message: error.message || 'The watchlist could not be changed.' };
    if (!data || data.ok !== true) {
      return { ok: false, message: (data && data.message) || 'The watchlist could not be changed.' };
    }
    return { ok: true, watching: data.watching === true };
  } catch (e) {
    return { ok: false, message: 'The watchlist could not be reached. Try again.' };
  }
}

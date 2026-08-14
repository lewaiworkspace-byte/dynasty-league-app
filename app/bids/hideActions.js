'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// Hiding a player on the auction bid list. A VIEW operation only: the
// player stays in the tier, still counts toward its public interest level
// under 6.1, and can be bid on the moment he is unhidden. Modeled on hiding
// rows in a spreadsheet.
//
// Always through createSupabaseServerClient(), never the admin client. The
// RLS on bid_player_hides is own-team-only with no commissioner clause,
// because which players an owner has ruled out reveals bidding intent as
// surely as a bid does. Using the admin client here would bypass exactly
// the protection the table was created for.
//
// These return result objects rather than throwing. Next.js masks every
// error thrown out of a Server Action in a production build, replacing the
// message with a generic "an error occurred in the Server Components
// render" string. Same pattern as app/team/[teamId]/actions.js and
// app/bids/actions.js.

/**
 * @returns {Promise<{ok:true} | {ok:false, message:string}>}
 */
export async function hidePlayer(tierId, playerId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to hide a player.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bid_player_hides')
    .insert({ tier_id: tierId, team_id: me.team_id, player_id: playerId });

  // Already hidden is not a failure -- the unique constraint fired because
  // the desired end state already holds.
  if (error && error.code !== '23505') {
    return { ok: false, message: error.message || 'Could not hide that player.' };
  }

  revalidatePath('/bids');
  return { ok: true };
}

/**
 * @returns {Promise<{ok:true} | {ok:false, message:string}>}
 */
export async function unhidePlayer(tierId, playerId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to unhide a player.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bid_player_hides')
    .delete()
    .eq('tier_id', tierId)
    .eq('team_id', me.team_id)
    .eq('player_id', playerId);

  if (error) {
    return { ok: false, message: error.message || 'Could not unhide that player.' };
  }

  revalidatePath('/bids');
  return { ok: true };
}

/**
 * Clears every hide this owner has in one tier.
 * @returns {Promise<{ok:true} | {ok:false, message:string}>}
 */
export async function unhideAllPlayers(tierId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to unhide players.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bid_player_hides')
    .delete()
    .eq('tier_id', tierId)
    .eq('team_id', me.team_id);

  if (error) {
    return { ok: false, message: error.message || 'Could not unhide those players.' };
  }

  revalidatePath('/bids');
  return { ok: true };
}

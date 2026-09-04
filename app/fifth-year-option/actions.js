'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// FIFTH YEAR OPTION -- server actions.
//
// Rule 5.9. A Round 1 rookie's fourth season carries an option on a fifth,
// priced by tier from EDFL Pro Bowl selections in his first three seasons.
// Exercising writes a NEW one-year contract for the option season, fully
// guaranteed, alongside the rookie deal that still covers this one.
//
// THERE IS DELIBERATELY NO COMMISSIONER CHECK AND NO OWNERSHIP CHECK HERE.
// The same reasoning as app/restructure/actions.js: the database is the gate,
// and exercise_fifth_year_option() / decline_fifth_year_option() distinguish
// "that player is not on your roster" from "a decision is already recorded"
// from "he is not option-eligible" with different sentences. An app-layer
// check would collapse all three into one generic refusal and tell the owner
// nothing they could act on. The board's can_decide flag decides which buttons
// are DRAWN; it is presentation, and it is not what stops anyone.
//
// THE SESSION CLIENT, NEVER adminClient(). These functions gate themselves on
// auth.uid(). Through the service-role client auth.uid() is NULL and every
// call would fail with "No owner record is linked to this login" -- the same
// trap the restructure actions carry a note about.
//
// ALL FOUR RETURN THEIR REFUSALS (ground rule 9). Next.js masks anything
// thrown out of a Server Action in a production build, replacing a carefully
// worded database refusal with "an error occurred in the Server Components
// render". .catch here means the network died, never that the database said
// no.

/** Shape a caught exception or a PostgREST error into the house refusal. */
function refusal(error, fallback) {
  const message = (error && error.message) || fallback;
  return { ok: false, message };
}

/**
 * The whole page in one call. fifth_year_option_board() returns the grid, the
 * rows, and per-row eligible / can_decide flags resolved against the caller.
 *
 * p_season is passed as null on purpose -- the function derives the current
 * season itself from league_config rather than the app hardcoding 2026, which
 * is the trap /cash and /admin/cash are still carrying.
 */
export async function loadFifthYearOptionBoard() {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to view option decisions.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('fifth_year_option_board', { p_season: null });

  if (error) {
    return refusal(error, 'The option board could not be loaded.');
  }
  return { ok: true, data };
}

export async function exerciseFifthYearOption(contractId, note) {
  if (!contractId) {
    return { ok: false, message: 'Pick a player before exercising an option.' };
  }

  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to exercise an option.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('exercise_fifth_year_option', {
    p_contract_id: contractId,
    p_note: note || null,
  });

  if (error) {
    return refusal(error, 'The option was refused and nothing was changed.');
  }

  revalidatePath('/fifth-year-option');
  // The exercise writes a contract, so the surfaces that read contracts move
  // too. /restructure because a recorded decision is what unlocks the rookie
  // deal for restructure; the team route as a PATTERN, not the acting owner's
  // team, per the 9135fc1 fix.
  revalidatePath('/restructure');
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');

  return { ok: true, data };
}

export async function declineFifthYearOption(contractId, note) {
  if (!contractId) {
    return { ok: false, message: 'Pick a player before declining an option.' };
  }

  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to decline an option.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('decline_fifth_year_option', {
    p_contract_id: contractId,
    p_note: note || null,
  });

  if (error) {
    return refusal(error, 'The decline was refused and nothing was changed.');
  }

  revalidatePath('/fifth-year-option');
  revalidatePath('/restructure');
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');

  return { ok: true, data };
}

/**
 * Commissioner / co-commissioner reversal, 96 hours. reverse_fifth_year_option()
 * holds the window and the officer check itself.
 *
 * NO CALLER EXISTS YET -- there is no reversal UI on the board. That is a
 * recorded gap, not a decision, and it is the same shape as the trade-draft
 * discard defect of August 27: a function that shipped with an action wrapper
 * and no button, so the capability was unreachable until somebody noticed.
 * Whoever builds the reversal dialog wires it here.
 */
export async function reverseFifthYearOption(eventId, reason) {
  if (!eventId) {
    return { ok: false, message: 'Nothing was selected to reverse.' };
  }
  if (!reason || !String(reason).trim()) {
    return { ok: false, message: 'A reason is required to reverse an option decision.' };
  }

  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to reverse an option decision.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('reverse_fifth_year_option', {
    p_event_id: eventId,
    p_reason: reason,
  });

  if (error) {
    return refusal(error, 'The reversal was refused and nothing was changed.');
  }

  revalidatePath('/fifth-year-option');
  revalidatePath('/restructure');
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');

  return { ok: true, data };
}

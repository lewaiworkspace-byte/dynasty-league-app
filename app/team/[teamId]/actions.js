'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// Both RPCs enforce their own rules in the database -- ownership, the
// cuts-open gate, the auction block, the League Reset freeze, and the
// June 1st designation allowance all live in cut_player() and
// compute_cut_charges(). The checks here exist for clearer error messages,
// not as the only gate. Never rely on this file alone for authorization.
//
// WHY THESE RETURN INSTEAD OF THROW (August 2026).
//
// Next.js MASKS every error thrown out of a Server Action in a production
// build. The client does not receive the message -- it receives:
//
//   "An error occurred in the Server Components render. The specific
//    message is omitted in production builds to avoid leaking sensitive
//    details. A digest property is included on this error instance..."
//
// So every carefully-worded refusal the database raises was invisible.
// The first real cut ever attempted hit "Cuts are blocked while any
// auction tier is open or unverified" -- a correct, deliberate,
// self-explanatory refusal -- and the owner saw the generic string above
// with no way to learn what was wrong. Every other message in cut_player()
// had the same problem: wrong roster, no designations left, cuts not open
// yet, transfer path not built.
//
// Returned VALUES are not masked. So these actions return a result object
// and never throw for an expected condition. The caller must check .ok.
//
// This applies to every Server Action in the app, not just these two. Any
// action that throws for a user-facing reason has the same defect.

/**
 * @returns {Promise<{ok:true, data:object} | {ok:false, message:string}>}
 */
export async function previewCut(contractId, useJune1Designation) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to preview a cut.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('compute_cut_charges', {
    p_contract_id: contractId,
    p_june1_designation: Boolean(useJune1Designation),
  });

  if (error) {
    return { ok: false, message: error.message || 'The settlement could not be calculated.' };
  }
  if (!data) {
    return { ok: false, message: 'The settlement came back empty. Nothing was changed.' };
  }
  return { ok: true, data };
}

/**
 * @returns {Promise<{ok:true, eventId:string} | {ok:false, message:string}>}
 */
export async function executeCut(contractId, useJune1Designation, note) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to cut a player.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cut_player', {
    p_contract_id: contractId,
    p_june1_designation: Boolean(useJune1Designation),
    p_salary_obligation_transfers: false,
    p_to_team_id: null,
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) {
    // The database refused. Its message is the useful one -- it names the
    // rule and, where relevant, the date or the count. Pass it straight
    // through. Nothing was written; cut_player() is a single transaction.
    return { ok: false, message: error.message || 'The cut was refused and nothing was changed.' };
  }

  // Revalidate the dynamic route rather than one resolved team page.
  //
  // This used to revalidate '/team/' + me.team_id -- the acting owner's own
  // team. For an owner cutting their own player that is the right page. For
  // a COMMISSIONER cutting from another team's roster, which canCut on
  // app/team/[teamId]/page.js permits and cut_player() allows, it is the
  // wrong one: the page actually being looked at is the other team's, and
  // it would keep serving stale cap and roster numbers until something
  // else happened to revalidate it.
  //
  // Passing the route pattern with 'page' invalidates every team page. A
  // cut is rare and these pages are cheap, so precision here is not worth
  // an extra round trip to look up the contract's team.
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/cap-sheet');
  revalidatePath('/cash');
  // The cuts ledger gains a row, and since September 4 the cut can be made
  // FROM that page -- /admin/cuts mounts this same dialog. Without this the
  // commissioner cuts a player and the history below the picker still shows
  // the state before it.
  revalidatePath('/admin/cuts');

  return { ok: true, eventId: data };
}

/**
 * Move a player between the active roster, the practice squad and injured
 * reserve. Rule 3.3 / 3.4 / 3.6.
 *
 * EVERY RULE HERE LIVES IN THE DATABASE, AND ONE OF THEM IS NOT EVEN IN THIS
 * FUNCTION. set_roster_status() enforces the squad limits -- taxi 7 (3.3(a)),
 * at most 3 non-rookie taxi slots (3.3(b)), IR 10 (3.4(a)), and the 25-man
 * active limit (3.6) which applies IN-SEASON ONLY. Practice-squad ELIGIBILITY
 * is enforced somewhere else again: check_taxi_eligibility is a TRIGGER on
 * contracts, anchored to the player's draft year, and it fires on the update
 * that set_roster_status performs. Its refusal names the draft year.
 *
 * So there is nothing to re-check here and nothing to mirror in JS. A client
 * copy of the eligibility rule would be a second place to keep in step with a
 * trigger, and the trigger would win every time they disagreed.
 *
 * @returns {Promise<{ok:true, data:object} | {ok:false, message:string}>}
 */
export async function setRosterStatus(contractId, status, note) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to move a player.' };
  }
  if (status !== 'active' && status !== 'taxi' && status !== 'ir') {
    return { ok: false, message: 'Pick the active roster, the practice squad or injured reserve.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('set_roster_status', {
    p_contract_id: contractId,
    p_status: status,
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) {
    // The database's message is the useful one. It names the rule and, for an
    // eligibility refusal, the player's draft year. Pass it through untouched.
    return { ok: false, message: error.message || 'The move was refused and nothing was changed.' };
  }

  // Same reasoning as executeCut: revalidate the route pattern, not one
  // resolved team page. The commissioner no longer moves players from a team
  // page -- that is own-roster-only now -- but /admin/cuts mounts this same
  // dialog against any contract, so both surfaces have to refresh.
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/admin/cuts');

  return { ok: true, data: data };
}

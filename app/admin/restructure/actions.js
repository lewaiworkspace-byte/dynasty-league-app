'use server';

import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { loadRosterData } from '../../../lib/restructureRoster';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED, RESTRUCTURE_DISABLED_MESSAGE } from '../../../lib/featureFlags';

// THE ADMIN HALF OF RESTRUCTURE: every team's contracts, not just the
// viewer's. It exists because /restructure is a League surface and a League
// surface treats the commissioner as an ordinary owner -- so the commissioner's
// ability to act for another team had to go somewhere, and this is it.
//
// ONLY THE ROSTER LOADER IS DUPLICATED, AND EVEN THAT IS NOT REALLY DUPLICATED.
// The query, the eligibility pass and the shaping live in
// lib/restructureRoster.js and both routes call it; this file's whole job is a
// different gate in front of the same thing. max_restructure,
// compute_restructure_charges and restructure_contract are NOT redeclared here
// -- the form keeps calling the League versions, because those already permit a
// commissioner to act on any team (restructure_contract enforces "own roster
// unless commissioner or co-commissioner" itself, exactly as cut_player does).
// Redeclaring them would give the same rule two homes and one of them would go
// stale.
//
// THE SESSION CLIENT, NEVER adminClient(). can_restructure() gates on
// auth.uid(); through the service role it is NULL and every row would come
// back refused.

/**
 * Every active contract in the league, with permission and eligibility already
 * resolved per contract.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function loadAllTeamsRestructureRoster() {
  if (!RESTRUCTURE_ENABLED) {
    return { ok: false, message: RESTRUCTURE_DISABLED_MESSAGE };
  }

  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }

  const supabase = await createSupabaseServerClient();
  // null scope = every team. me.team_id is still passed through so the form can
  // tell the commissioner which rows are their own.
  return loadRosterData(supabase, null, me.team_id);
}

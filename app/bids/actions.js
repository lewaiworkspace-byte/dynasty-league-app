'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// IMPORTANT: this uses createSupabaseServerClient(), NOT adminClient() from
// lib/supabaseAdmin.js, unlike every other Server Action in this app.
// submit_bid() is SECURITY DEFINER and derives the bidding team from
// auth.uid() internally -- the admin client carries no user session, so
// auth.uid() would return null and every call would fail its
// "no team_owners row is linked to the current user" check.
//
// Parameter names below are verified against the live function definition
// (pg_get_functiondef on public.submit_bid), not assumed.
//
// WHY THIS RETURNS INSTEAD OF THROWING (August 2026).
//
// Next.js MASKS every error thrown out of a Server Action in a production
// build. The client does not receive the message -- it receives:
//
//   "An error occurred in the Server Components render. The specific
//    message is omitted in production builds to avoid leaking sensitive
//    details. A digest property is included on this error instance..."
//
// So every refusal submit_bid() raises arrived at the bid form unreadable:
// the minimum legal bid PPV floor, the Deion Rule, the league minimum, the
// 30% Rule triggers, a tier that closed while the form was open, and the
// sealed-bid RLS. BidForm runs Deion, league-minimum and 30% client-side
// before submitting, so those three usually surface first -- but the
// minimum-legal-PPV floor and tier-closed have NO client mirror, and they
// are precisely the refusals an owner meets against a closing deadline,
// which is when an unreadable error costs the most.
//
// Returned VALUES are not masked. This action returns a result object and
// never throws for an expected condition. The caller must check .ok.
//
// Same pattern as app/team/[teamId]/actions.js. It applies to every Server
// Action in this app that throws for a user-facing reason; the rest are
// unaudited as of this commit, including app/bids/delegationActions.js.

/**
 * @returns {Promise<{ok:true, bidId:string} | {ok:false, message:string}>}
 */
export async function submitBid(payload) {
  // Checked here only for a clearer error message -- the real enforcement
  // is inside submit_bid() itself via auth.uid().
  const teamOwner = await getCurrentTeamOwner();
  if (!teamOwner) {
    return {
      ok: false,
      message:
        'You must be logged in and linked to a team to submit a bid. Your session may have ' +
        'expired — reload the page and sign in again. Nothing was submitted.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_bid', {
    p_tier_id: payload.tierId,
    p_player_id: payload.playerId,
    p_start_year: Number(payload.startYear),
    p_total_years: Number(payload.totalYears),
    p_void_years: Number(payload.voidYears) || 0,
    p_signing_bonus_total: Number(payload.signingBonusTotal) || 0,
    p_years: payload.years,
    p_option_bonuses: payload.optionBonuses,
  });

  if (error) {
    // The database refused. Its message names the rule and, where relevant,
    // the season, the amount and the limit. Pass it straight through.
    // Nothing was written; submit_bid() is a single transaction.
    return { ok: false, message: error.message || 'This bid was refused and was not submitted.' };
  }

  return { ok: true, bidId: data };
}

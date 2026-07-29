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
export async function submitBid(payload) {
  // Checked here only for a clearer error message -- the real enforcement
  // is inside submit_bid() itself via auth.uid().
  const teamOwner = await getCurrentTeamOwner();
  if (!teamOwner) {
    throw new Error('You must be logged in and linked to a team to submit a bid.');
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

  if (error) throw new Error(error.message);
  return data; // the bid's uuid
}

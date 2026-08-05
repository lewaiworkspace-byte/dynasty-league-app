'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// Same pattern as app/bids/actions.js's submitBid(): each action here uses
// createSupabaseServerClient(), NOT adminClient() from lib/supabaseAdmin.js.
// Every RPC below is SECURITY DEFINER and derives the acting team from
// auth.uid() internally -- the admin client carries no user session, so
// auth.uid() would return null and every call would fail. Nothing here
// ever passes a team_id from the client for that reason.
//
// Each action independently re-checks getCurrentTeamOwner() -- Server
// Actions are callable endpoints regardless of what the UI renders, and
// this app already treats that as a rule (see app/bids/actions.js and
// every admin action's requireCommissioner()-style check).
async function requireTeamOwner(message) {
  const teamOwner = await getCurrentTeamOwner();
  if (!teamOwner) {
    throw new Error(message);
  }
  return teamOwner;
}

// Preserves NULL rather than collapsing it to 0. This matters for
// p_chart_total_ppv specifically: NULL means "this player is not on the
// published chart", and 0 would mean "the chart values him at nothing".
// Those are different facts and the column exists to tell them apart, so
// the usual Number(x) || 0 coercion would destroy the only information
// the column carries.
function nullableNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function revalidateDelegationRoutes(tierId) {
  // The existing bid action gets away without calling revalidatePath at
  // all because /bids sets revalidate = 0. That coincidence shouldn't be
  // relied on here -- the delegation route doesn't have the same blanket
  // no-cache setting guaranteed for it, so every state-changing action
  // below revalidates explicitly.
  revalidatePath('/bids');
  if (tierId) {
    revalidatePath('/bids/' + tierId + '/delegate');
  }
}

/**
 * Creates or updates one player's delegation row via the upsert_bid_delegation
 * RPC. Called once per included player from the delegate page, before
 * armDelegations() fires the tier as a whole.
 *
 * @param {object} input
 * @param {string} input.tierId
 * @param {string} input.playerId
 * @param {'execute'|'propose'|'discretionary'} input.mode
 * @param {number} input.priority - lower fires first
 * @param {number} input.totalYears
 * @param {number} [input.voidYears]
 * @param {number} [input.signingBonusTotal]
 * @param {Array} input.years - buildBidPayload()'s years array
 * @param {Array} input.optionBonuses - buildBidPayload()'s optionBonuses array
 * @param {number|null} [input.targetPpv]
 * @param {'front_loaded'|'back_loaded'|'pay_as_you_go'|null} [input.philosophy]
 * @param {number|null} [input.generatedPpv]
 * @param {number|null} [input.previewTotalPpv]
 * @param {number|null} [input.previewTotalCap]
 * @param {number|null} [input.previewTotalCash]
 * @param {string|null} [input.assistantNote]
 * @param {boolean} input.validated
 * @param {Array<string>} input.validationIssues
 * @param {string|null} [input.interestLevel] - bid_interest_levels.code
 * @param {number|null} [input.chartTotalPpv] - NULL for an off-chart player
 * @param {number|null} [input.chartDerivedTarget] - what the interest tag suggested
 * @returns {Promise<string>} the delegation uuid
 */
export async function upsertDelegation(input) {
  await requireTeamOwner('You must be logged in and linked to a team to set up Auto-Bid.');
  const supabase = await createSupabaseServerClient();

  // No start_year here on purpose -- the database derives it from the tier
  // itself, unlike submit_bid() (which the live bid form calls directly
  // and which does take a start year, since a manual bid isn't necessarily
  // tied to a tier's own season).
  //
  // The three chart-provenance parameters at the end record what the
  // league chart suggested alongside what the owner actually used, so an
  // override stays visible after the fact. They are NOT derived
  // server-side -- if this stops sending them they go back to being NULL
  // forever, which is exactly the defect this call previously had.
  const { data, error } = await supabase.rpc('upsert_bid_delegation', {
    p_tier_id: input.tierId,
    p_player_id: input.playerId,
    p_mode: input.mode,
    p_priority: input.priority,
    p_total_years: Number(input.totalYears),
    p_void_years: Number(input.voidYears) || 0,
    p_signing_bonus_total: Number(input.signingBonusTotal) || 0,
    p_years: input.years,
    p_option_bonuses: input.optionBonuses,
    p_target_ppv: input.targetPpv,
    p_philosophy: input.philosophy,
    p_generated_ppv: input.generatedPpv,
    p_preview_total_ppv: input.previewTotalPpv,
    p_preview_total_cap: input.previewTotalCap,
    p_preview_total_cash: input.previewTotalCash,
    p_assistant_note: input.assistantNote,
    p_validated: input.validated,
    p_validation_issues: input.validationIssues,
    p_interest_level: input.interestLevel === undefined ? null : input.interestLevel,
    p_chart_total_ppv: nullableNumber(input.chartTotalPpv),
    p_chart_derived_target: nullableNumber(input.chartDerivedTarget),
  });

  if (error) throw new Error(error.message);

  revalidateDelegationRoutes(input.tierId);

  return data;
}

/**
 * Fires every armed delegation for a tier via the arm_bid_delegations RPC.
 * p_fire_mode is hardcoded to 'immediate' below and is never read from
 * input -- at_close has no executor behind it (submit_bid refuses once
 * now() is past closes_at, and it derives the team from auth.uid(), which
 * a scheduled job doesn't have), so this action can't be made to pass
 * anything else even if a future UI bug tried to.
 *
 * @param {object} input
 * @param {string} input.tierId
 * @param {number|null} [input.maxBids] - null/undefined means no limit
 * @param {number|null} [input.maxTotalCash] - null/undefined means no limit
 * @param {number|null} [input.maxTotalCap] - null/undefined means no limit
 * @param {string|null} [input.note]
 * @returns {Promise<{fired:number, skipped:number, failed:number, exposure_cash:number, exposure_cap:number}>}
 */
export async function armDelegations(input) {
  await requireTeamOwner('You must be logged in and linked to a team to arm Auto-Bid.');
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('arm_bid_delegations', {
    p_tier_id: input.tierId,
    p_fire_mode: 'immediate',
    p_max_bids: input.maxBids,
    p_max_total_cash: input.maxTotalCash,
    p_max_total_cap: input.maxTotalCap,
    p_note: input.note,
  });

  if (error) throw new Error(error.message);

  revalidateDelegationRoutes(input.tierId);

  return data;
}

/**
 * Cancels one delegation via the cancel_bid_delegation RPC. Looks up the
 * delegation's own tier_id first (readable under RLS since it's this
 * owner's own row) purely so the delegation route can be revalidated too,
 * not just /bids -- the RPC itself only takes p_delegation_id.
 *
 * @param {string} delegationId
 */
export async function cancelDelegation(delegationId) {
  await requireTeamOwner('You must be logged in and linked to a team to cancel an Auto-Bid delegation.');
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('bid_delegations')
    .select('tier_id')
    .eq('id', delegationId)
    .maybeSingle();

  const { error } = await supabase.rpc('cancel_bid_delegation', {
    p_delegation_id: delegationId,
  });

  if (error) throw new Error(error.message);

  revalidateDelegationRoutes(existing ? existing.tier_id : null);
}

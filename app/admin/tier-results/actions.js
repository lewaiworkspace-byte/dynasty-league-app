'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { adminClient } from '../../../lib/supabaseAdmin';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// Every action here writes to commissioner_actions, so the public log at
// /actions covers auction decisions alongside deletions and cash changes.
// A co-commissioner's decisions are logged the same way and under their own
// owner id, so the log still says who did what.

// Widened to co-commissioners August 25, 2026. Kept as a helper so every
// action shares one gate -- widening it in one place was the point. It returns
// the owner or null; the actions turn null into a returned refusal.
//
// Every action here RETURNS { ok, message } rather than throwing (September 16,
// 2026): a production build masks a thrown message, so the officer would see a
// generic error instead of the database's reason.
async function officerOrNull() {
  const me = await getCurrentTeamOwner();
  return isCommissionerOrCo(me) ? me : null;
}

// Logging must never take down the action itself -- if the log insert
// fails, the tier decision has already happened, so the action still reports
// success and carries the log failure back as logError for the panel to show.
//
// THROUGH adminClient(), NOT the session client (September 16, 2026).
// log_commissioner_action() is executable by service_role only -- it
// authorises nothing itself and trusts its caller -- so a session-client call
// is refused, and it was being refused silently: tier decisions made after the
// grant was narrowed would never have reached /actions. The officer gate above
// has already run, and p_owner_id records who acted.
async function logAction(me, { actionType, targetId, summary, reason, snapshot }) {
  const { error } = await adminClient().rpc('log_commissioner_action', {
    p_owner_id: me.id,
    p_action_type: actionType,
    p_target_type: 'tier',
    p_target_id: targetId,
    p_summary: summary,
    p_reason: reason === undefined ? null : reason,
    p_snapshot: snapshot === undefined ? null : snapshot,
  });
  if (error) {
    console.error('Failed to write commissioner action log:', error.message);
    return error.message;
  }
  return null;
}

async function tierName(supabase, tierId) {
  const { data } = await supabase
    .from('auction_tiers')
    .select('name')
    .eq('id', tierId)
    .maybeSingle();
  return data?.name || 'a tier';
}

export async function evaluateTier(tierId) {
  const me = await officerOrNull();
  if (!me) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('evaluate_auction_tier', { p_tier_id: tierId });
  if (error) return { ok: false, message: error.message };

  const name = await tierName(supabase, tierId);
  const logError = await logAction(me, {
    actionType: 'tier_evaluate',
    targetId: tierId,
    summary: 'Evaluated bids for ' + name + ' — winners selected by highest total PPV',
  });

  revalidatePath('/admin/tier-results/' + tierId);
  revalidatePath('/actions');
  return { ok: true, logError: logError };
}

export async function passOverWinner(tierId, bidId) {
  const me = await officerOrNull();
  if (!me) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  const supabase = await createSupabaseServerClient();

  // Captured before the call, so the log can name who lost the player
  // rather than just referencing a bid id.
  const { data: before } = await supabase
    .from('bids')
    .select('team_id, player_id')
    .eq('id', bidId)
    .maybeSingle();

  const [{ data: team }, { data: player }] = await Promise.all([
    before?.team_id
      ? supabase.from('teams').select('name').eq('id', before.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
    before?.player_id
      ? supabase.from('players').select('full_name').eq('id', before.player_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { error } = await supabase.rpc('pass_over_winner', { p_bid_id: bidId });
  if (error) return { ok: false, message: error.message };

  const name = await tierName(supabase, tierId);
  const logError = await logAction(me, {
    actionType: 'bid_pass_over',
    targetId: tierId,
    summary:
      ((team && team.name) || 'A team') +
      ' lost ' +
      ((player && player.full_name) || 'a player') +
      ' in ' +
      name +
      ' — unresolved cap or cash flag, win passed to the next-highest bid',
    snapshot: { tier_id: tierId, passed_over_bid_id: bidId },
  });

  revalidatePath('/admin/tier-results/' + tierId);
  revalidatePath('/actions');
  return { ok: true, logError: logError };
}

export async function verifyTier(tierId) {
  const me = await officerOrNull();
  if (!me) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('verify_auction_tier', { p_tier_id: tierId });
  if (error) return { ok: false, message: error.message };

  const name = await tierName(supabase, tierId);
  const logError = await logAction(me, {
    actionType: 'tier_verify',
    targetId: tierId,
    summary:
      'Verified ' + name + ' — results published and ' + data + ' contract' + (data === 1 ? '' : 's') + ' created',
  });

  revalidatePath('/admin/tier-results/' + tierId);
  revalidatePath('/bids');
  revalidatePath('/cap-sheet');
  revalidatePath('/actions');
  return { ok: true, data: data, logError: logError };
}

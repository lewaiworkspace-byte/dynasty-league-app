'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// Every action here writes to commissioner_actions, so the public log at
// /actions covers auction decisions alongside deletions and cash changes.
// A co-commissioner's decisions are logged the same way and under their own
// owner id, so the log still says who did what.

// Widened to co-commissioners August 25, 2026. Kept as a helper so all four
// actions share one gate -- widening it in one place was the point.
async function requireCommissionerOrCo() {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }
  return me;
}

// Logging must never take down the action itself -- if the log insert
// fails, the tier decision has already happened and swallowing the error
// is better than reporting a failure that didn't occur. Failures are
// surfaced to the server console instead.
async function logAction(supabase, me, { actionType, targetId, summary, reason, snapshot }) {
  const { error } = await supabase.rpc('log_commissioner_action', {
    p_owner_id: me.id,
    p_action_type: actionType,
    p_target_type: 'tier',
    p_target_id: targetId,
    p_summary: summary,
    p_reason: reason ?? null,
    p_snapshot: snapshot ?? null,
  });
  if (error) console.error('Failed to write commissioner action log:', error.message);
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
  const me = await requireCommissionerOrCo();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('evaluate_auction_tier', { p_tier_id: tierId });
  if (error) throw new Error(error.message);

  const name = await tierName(supabase, tierId);
  await logAction(supabase, me, {
    actionType: 'tier_evaluate',
    targetId: tierId,
    summary: `Evaluated bids for ${name} — winners selected by highest total PPV`,
  });

  revalidatePath(`/admin/tier-results/${tierId}`);
  revalidatePath('/actions');
}

export async function passOverWinner(tierId, bidId) {
  const me = await requireCommissionerOrCo();
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
  if (error) throw new Error(error.message);

  const name = await tierName(supabase, tierId);
  await logAction(supabase, me, {
    actionType: 'bid_pass_over',
    targetId: tierId,
    summary: `${team?.name || 'A team'} lost ${player?.full_name || 'a player'} in ${name} — unresolved cap or cash flag, win passed to the next-highest bid`,
    snapshot: { tier_id: tierId, passed_over_bid_id: bidId },
  });

  revalidatePath(`/admin/tier-results/${tierId}`);
  revalidatePath('/actions');
}

export async function verifyTier(tierId) {
  const me = await requireCommissionerOrCo();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('verify_auction_tier', { p_tier_id: tierId });
  if (error) throw new Error(error.message);

  const name = await tierName(supabase, tierId);
  await logAction(supabase, me, {
    actionType: 'tier_verify',
    targetId: tierId,
    summary: `Verified ${name} — results published and ${data} contract${data === 1 ? '' : 's'} created`,
  });

  revalidatePath(`/admin/tier-results/${tierId}`);
  revalidatePath('/bids');
  revalidatePath('/cap-sheet');
  revalidatePath('/actions');
  return data;
}

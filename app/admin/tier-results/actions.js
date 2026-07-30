'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// The three underlying database functions are SECURITY DEFINER and are
// GRANTed to `authenticated` -- they do NOT check the caller's role
// themselves. These wrappers are the only thing standing between a
// logged-in owner and the commissioner's controls, so the check has to
// happen here, in every one of them.
async function requireCommissioner() {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can resolve auction tiers.');
  }
  return me;
}

export async function evaluateTier(tierId) {
  await requireCommissioner();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('evaluate_auction_tier', { p_tier_id: tierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tier-results/${tierId}`);
}

export async function passOverWinner(tierId, bidId) {
  await requireCommissioner();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('pass_over_winner', { p_bid_id: bidId });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tier-results/${tierId}`);
}

export async function verifyTier(tierId) {
  await requireCommissioner();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('verify_auction_tier', { p_tier_id: tierId });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tier-results/${tierId}`);
  revalidatePath('/bids');
  revalidatePath('/cap-sheet');
  return data; // number of contracts created
}

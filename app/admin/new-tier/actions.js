'use server';

import { adminClient } from '../../../lib/supabaseAdmin';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// RETURNS { ok: true, tierId } or { ok: false, message } (September 16, 2026).
// A thrown message is masked in a production build, so a refusal is returned.
export async function createTier(payload) {
  // Server Actions are callable endpoints regardless of what the UI
  // renders -- the page's redirect alone doesn't protect this write path.
  //
  // Widened to co-commissioners August 25, 2026. This one matters more than
  // most: the write below goes through adminClient(), the service role, which
  // bypasses RLS entirely. This check IS the gate, not a nicety on top of one.
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }

  const supabase = adminClient();

  const { seasonYear, tierNumber, name, opensAt, closesAt, playerIds } = payload || {};

  if (!opensAt || !closesAt) {
    return { ok: false, message: 'Both an open and a close time are required.' };
  }
  if (new Date(closesAt) <= new Date(opensAt)) {
    return { ok: false, message: 'The close time must be after the open time.' };
  }
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return { ok: false, message: 'Add at least one player to the tier.' };
  }

  // 1. Create the tier
  const { data: tier, error: tierErr } = await supabase
    .from('auction_tiers')
    .insert({
      season_year: Number(seasonYear),
      tier_number: Number(tierNumber),
      name: name?.trim() || null,
      opens_at: opensAt,
      closes_at: closesAt,
    })
    .select('id')
    .single();

  if (tierErr) {
    if (tierErr.message.includes('auction_tiers_no_overlap') || tierErr.message.includes('exclusion')) {
      return {
        ok: false,
        message: 'This window overlaps another tier — only one tier can be open at a time. Adjust the dates.',
      };
    }
    if (tierErr.message.includes('duplicate') || tierErr.message.includes('unique')) {
      return {
        ok: false,
        message:
          'Tier ' + tierNumber + ' already exists for ' + seasonYear + ' — pick a different tier number.',
      };
    }
    return { ok: false, message: tierErr.message };
  }

  // 2. Attach the players. If this fails, remove the tier row too so a
  // partial tier (dates but no players) isn't left behind -- these are two
  // separate PostgREST calls, not one transaction (see reference doc
  // Section 4), so cleanup is manual.
  const tierPlayerRows = playerIds.map((pid) => ({ tier_id: tier.id, player_id: pid }));
  const { error: playersErr } = await supabase.from('auction_tier_players').insert(tierPlayerRows);

  if (playersErr) {
    await supabase.from('auction_tiers').delete().eq('id', tier.id);
    return { ok: false, message: 'Adding players failed, tier not created: ' + playersErr.message };
  }

  return { ok: true, tierId: tier.id };
}

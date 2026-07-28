'use server';

// Expected location: app/admin/new-tier/actions.js

import { adminClient } from '../../../lib/supabaseAdmin';

export async function createTier(payload) {
  const supabase = adminClient();

  const { seasonYear, tierNumber, name, opensAt, closesAt, playerIds } = payload;

  if (!opensAt || !closesAt) throw new Error('Both an open and a close time are required.');
  if (new Date(closesAt) <= new Date(opensAt)) {
    throw new Error('The close time must be after the open time.');
  }
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    throw new Error('Add at least one player to the tier.');
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
      throw new Error(
        'This window overlaps another tier — only one tier can be open at a time. Adjust the dates.'
      );
    }
    if (tierErr.message.includes('duplicate') || tierErr.message.includes('unique')) {
      throw new Error(
        `Tier ${tierNumber} already exists for ${seasonYear} — pick a different tier number.`
      );
    }
    throw new Error(tierErr.message);
  }

  // 2. Attach the players. If this fails, remove the tier row too so a
  // partial tier (dates but no players) isn't left behind -- these are two
  // separate PostgREST calls, not one transaction (see reference doc
  // Section 4), so cleanup is manual.
  const tierPlayerRows = playerIds.map((pid) => ({ tier_id: tier.id, player_id: pid }));
  const { error: playersErr } = await supabase.from('auction_tier_players').insert(tierPlayerRows);

  if (playersErr) {
    await supabase.from('auction_tiers').delete().eq('id', tier.id);
    throw new Error('Adding players failed, tier not created: ' + playersErr.message);
  }

  return { tierId: tier.id };
}

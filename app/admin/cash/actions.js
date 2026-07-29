'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '../../../lib/supabaseAdmin';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

export async function recordCashTransaction(payload) {
  // Real gate, not just UI hiding -- the page also checks this, but the
  // action must enforce it itself since Server Actions are callable
  // endpoints regardless of what the UI shows.
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can record cash transactions.');
  }

  const amount = Number(payload.amount);
  if (!payload.teamId) throw new Error('Pick a team.');
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('Amount must be a non-zero number. Use a negative number for a penalty/deduction.');
  }
  if (!['cash_purchase', 'penalty', 'adjustment', 'other'].includes(payload.category)) {
    throw new Error('Invalid category.');
  }

  const supabase = adminClient();

  const { error } = await supabase.from('team_cash_transactions').insert({
    team_id: payload.teamId,
    season_year: Number(payload.seasonYear),
    amount,
    category: payload.category,
    note: payload.note?.trim() || null,
    created_by: me.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/admin/cash');
  revalidatePath('/cash');
}

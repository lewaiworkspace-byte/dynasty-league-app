'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '../../../lib/supabaseAdmin';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// RETURNS, NEVER THROWS (September 16, 2026). Next.js masks a message thrown
// out of a Server Action in a production build, so every refusal below used to
// reach the commissioner as the generic "An error occurred in the Server
// Components render" string. The caller (CashForm.js) checks .ok.
//
// THE ONLY GATE IS THIS FUNCTION. The write uses adminClient(), the service
// role, which bypasses RLS, and team_cash_transactions has no write policy and
// no write function in the database -- so nothing behind this check refuses.
// Widened to co-commissioners August 25, 2026. The log_cash_transaction trigger
// writes the public Commissioner Action Log row for every insert.
//
// @returns {Promise<{ok:true} | {ok:false, message:string}>}
export async function recordCashTransaction(payload) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }

  const input = payload || {};
  const amount = Number(input.amount);
  const seasonYear = Number(input.seasonYear);
  if (!input.teamId) {
    return { ok: false, message: 'Pick a team.' };
  }
  if (!Number.isFinite(amount) || amount === 0) {
    return {
      ok: false,
      message: 'Amount must be a non-zero number. Use a negative number for a penalty or deduction.',
    };
  }
  if (!Number.isInteger(seasonYear)) {
    return { ok: false, message: 'The season is missing. Reload the page and try again.' };
  }
  if (!['cash_purchase', 'penalty', 'adjustment', 'other'].includes(input.category)) {
    return { ok: false, message: 'Invalid category.' };
  }

  const supabase = adminClient();

  const { error } = await supabase.from('team_cash_transactions').insert({
    team_id: input.teamId,
    season_year: seasonYear,
    amount: amount,
    category: input.category,
    note: input.note && input.note.trim() ? input.note.trim() : null,
    created_by: me.id,
  });

  if (error) {
    return { ok: false, message: error.message || 'The transaction was refused and nothing was recorded.' };
  }

  revalidatePath('/admin/cash');
  revalidatePath('/cash');
  return { ok: true };
}

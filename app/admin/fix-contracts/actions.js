'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// Both RPCs gate themselves internally, so authorization is enforced in the
// database regardless of how they're reached. This check is here for a
// clearer error message, not as the only gate.
//
// Widened to co-commissioners August 25, 2026. Both actions below are
// HARD DELETES, so if either RPC still calls require_commissioner() rather
// than require_commissioner_or_co(), the database refuses after this check
// passes. Deny is the right direction to fail, but confirm it in the browser.
//
// RETURN, NEVER THROW (September 16, 2026). A thrown message is masked in a
// production build, and commissioner_delete_contract() refuses with sentences
// worth reading (a contract a trade or a free agency award still points at).
// The caller checks .ok. deleteBid has no caller in the app today; it is kept,
// converted the same way, for the auction's return.

// @returns {Promise<{ok:true} | {ok:false, message:string}>}
export async function deleteContract(contractId, reason) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, message: 'A reason is required — it appears in the public action log.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('commissioner_delete_contract', {
    p_contract_id: contractId,
    p_reason: reason.trim(),
  });
  if (error) {
    return { ok: false, message: error.message || 'The deletion was refused and nothing was changed.' };
  }

  revalidatePath('/admin/fix-contracts');
  revalidatePath('/actions');
  revalidatePath('/cap-sheet');
  return { ok: true };
}

// @returns {Promise<{ok:true} | {ok:false, message:string}>}
export async function deleteBid(bidId, reason) {
  // Widened to co-commissioners August 25, 2026 -- see deleteContract above.
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, message: 'A reason is required — it appears in the public action log.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('commissioner_delete_bid', {
    p_bid_id: bidId,
    p_reason: reason.trim(),
  });
  if (error) {
    return { ok: false, message: error.message || 'The deletion was refused and nothing was changed.' };
  }

  revalidatePath('/admin/fix-contracts');
  revalidatePath('/actions');
  return { ok: true };
}

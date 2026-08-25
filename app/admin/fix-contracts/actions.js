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
export async function deleteContract(contractId, reason) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required — it appears in the public action log.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('commissioner_delete_contract', {
    p_contract_id: contractId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/fix-contracts');
  revalidatePath('/actions');
  revalidatePath('/cap-sheet');
}

export async function deleteBid(bidId, reason) {
  // Widened to co-commissioners August 25, 2026 -- see deleteContract above.
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required — it appears in the public action log.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('commissioner_delete_bid', {
    p_bid_id: bidId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/fix-contracts');
  revalidatePath('/actions');
}

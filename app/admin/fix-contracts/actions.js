'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// Both RPCs call require_commissioner() internally, so authorization is
// enforced in the database regardless of how they're reached. This check is
// here for a clearer error message, not as the only gate.
export async function deleteContract(contractId, reason) {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can delete contracts.');
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
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can delete bids.');
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

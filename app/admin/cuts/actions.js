'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// reverse_cut() gates itself in the database, so the database enforces this
// regardless of how the action is reached. The check here is for a clearer
// message, not as the only gate -- Server Actions are callable endpoints
// whatever the page renders.
//
// Widened to co-commissioners August 25, 2026. If reverse_cut() itself still
// calls require_commissioner() rather than require_commissioner_or_co(), the
// database will refuse a co-commissioner after this check passes -- that is
// the correct failure direction (deny), but it is worth confirming in the
// browser rather than assuming.
export async function reverseCut(eventId, reason) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required — it appears in the public action log.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reverse_cut', {
    p_event_id: eventId,
    p_reason: reason.trim(),
  });

  if (error) throw new Error(error.message);

  revalidatePath('/admin/cuts');
  revalidatePath('/cap-sheet');
  revalidatePath('/cash');
  revalidatePath('/actions');
}

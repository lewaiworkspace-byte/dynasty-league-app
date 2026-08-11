'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// reverse_cut() calls require_commissioner() internally, so the database
// enforces this regardless of how the action is reached. The check here is
// for a clearer message, not as the only gate -- Server Actions are callable
// endpoints whatever the page renders.
export async function reverseCut(eventId, reason) {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can reverse a cut.');
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

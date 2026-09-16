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
//
// RETURNS, NEVER THROWS (September 16, 2026). A message thrown out of a Server
// Action is masked in a production build, so reverse_cut()'s guards -- the
// 96-hour window, the player signed elsewhere, a tier verified since -- reached
// the officer as a generic error. The caller (CutsPanel.js) checks .ok.
//
// @returns {Promise<{ok:true} | {ok:false, message:string}>}
export async function reverseCut(eventId, reason) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, message: 'A reason is required — it appears in the public action log.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reverse_cut', {
    p_event_id: eventId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: error.message || 'The reversal was refused and nothing was changed.' };
  }

  revalidatePath('/admin/cuts');
  revalidatePath('/cap-sheet');
  revalidatePath('/cash');
  revalidatePath('/actions');
  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '../../../lib/supabaseAdmin';
import { getCurrentTeamOwner, isCommissionerOrCo, COMMISSIONER_OR_CO_REFUSAL }
  from '../../../lib/getCurrentTeamOwner';
import { runInjurySync, shouldLog, summaryLine, SYNC_BUSY } from '../../../lib/injurySync';

// WIDENED, on the commissioner's instruction of September 8 2026: the injury
// pull is a commissioner AND co-commissioner tool. That is a deliberate choice,
// not an inherited default -- lib/getCurrentTeamOwner.js says the default is
// DENY and that anything new stays strict until somebody widens it on purpose.
// This is that purpose, recorded here so a later reader does not have to guess.
//
// It does NOT follow the /admin/sync-players precedent, which is strict for a
// different reason: that page inserts player rows. This one cannot -- see
// apply_injury_sync().
//
// The gate below is the ONLY gate on this write path. Like /admin/sync-players
// and /admin/import-stats, the pull runs through adminClient() (service_role),
// so no database function refuses behind it. Nothing here may be relaxed on the
// assumption that the database will catch it.

export async function runInjurySyncAction(prevState, formData) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { status: 'error', message: COMMISSIONER_OR_CO_REFUSAL };
  }

  let summary;
  try {
    summary = await runInjurySync({ triggerSource: 'manual', runBy: me.id });
  } catch (err) {
    if (err && err.code === SYNC_BUSY) {
      return { status: 'busy', message: err.message };
    }
    return { status: 'error', message: err && err.message ? err.message : String(err) };
  }

  // SR-13, answered by ruling rather than by habit: log only a pull that moved
  // something. shouldLog() is the single place that decides, so the cron and
  // this button can never disagree about what is worth recording.
  if (shouldLog(summary)) {
    const supabase = adminClient();
    const { error: logError } = await supabase.rpc('log_commissioner_action', {
      p_owner_id: me.id,
      p_action_type: 'injury_sync',
      p_target_type: 'injury_sync_run',
      p_target_id: summary.run_id,
      p_summary: summaryLine(summary),
      p_reason: null,
      p_snapshot: summary,
    });
    // A failed log must not make a successful pull look failed. Say so on the
    // result instead of throwing it away.
    if (logError) summary.log_error = logError.message;
  }

  revalidatePath('/injury-report');
  revalidatePath('/admin/injury-sync');

  return { status: 'done', summary: summary };
}

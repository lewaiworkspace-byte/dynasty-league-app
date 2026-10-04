'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

/**
 * OWNER SETTINGS -- Server Actions. October 4, 2026.
 *
 * One write, a thin call to one database function:
 *   save_my_roster_prefs   the signed-in owner's automatic IR choices
 *
 * The DATABASE is the gate: the function reads auth.uid() and writes the
 * caller's own row only, so there is no owner id to pass. Refusals are
 * RETURNED, not thrown (CLAUDE.md ground rule 10: a production build masks a
 * thrown message).
 *
 * The notification and contact-card writes keep their own actions
 * (app/notifications/actions.js, components/ownerInfoActions.js); this page
 * only gathers the three forms in one place.
 *
 * Rulings (Commissioner, October 4, 2026):
 *   AI-1  move IR players who lose IR/Out/Doubtful/PUP back to the Active
 *         Roster -- even when that puts the team over a limit.
 *   AI-2  move Active Roster players who carry IR/Out/Doubtful/PUP to IR --
 *         Active Roster only, never the practice squad.
 */
export async function saveRosterPrefs(input) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };

    const { data, error } = await supabase.rpc('save_my_roster_prefs', {
      p_auto_ir_to_active: Boolean(input && input.toActive),
      p_auto_ir_to_ir: Boolean(input && input.toIr),
    });
    if (error) return { ok: false, message: error.message || 'Your choices could not be saved.' };
    return { ok: true, prefs: data };
  } catch (e) {
    return { ok: false, message: 'Your choices could not be saved. Check your connection and try again.' };
  }
}

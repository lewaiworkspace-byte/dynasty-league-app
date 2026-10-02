'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

/**
 * NOTIFICATIONS -- Server Actions. October 1, 2026.
 *
 * Two writes, each a thin call to one database function:
 *   save_my_notification_prefs   the signed-in owner's own channels
 *   send_my_test_notification    one test message on every channel he chose
 *
 * The DATABASE is the gate for both: each function reads auth.uid() and acts
 * on the caller's own team_owners row only, so there is no owner id to pass
 * and nothing here an owner could point at somebody else. Validation (email
 * shape, the 17-to-20-digit Discord user id, one test every ten minutes) is in
 * the functions too, and their refusals are written to be read by an owner --
 * these actions RETURN them verbatim rather than throwing (CLAUDE.md ground
 * rule 10: a production build masks a thrown message).
 *
 * Rulings (Oct 1, 2026): channels are email, Discord DM and a public Discord
 * callout; the default is in-app + email; an owner may turn every outside
 * channel off. The in-app alert cannot be turned off and is not a setting.
 */

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refusal(error, fallback) {
  const msg = error && error.message ? String(error.message) : '';
  return { ok: false, message: msg || fallback };
}

export async function saveNotificationPrefs(input) {
  try {
    const { supabase, user } = await signedIn();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };

    const { data, error } = await supabase.rpc('save_my_notification_prefs', {
      p_email_enabled: Boolean(input && input.emailEnabled),
      p_email_override: input && input.emailOverride ? String(input.emailOverride) : null,
      p_discord_dm_enabled: Boolean(input && input.discordDmEnabled),
      p_discord_public_enabled: Boolean(input && input.discordPublicEnabled),
      p_discord_user_id: input && input.discordUserId ? String(input.discordUserId) : null,
    });
    if (error) return refusal(error, 'Your preferences could not be saved.');
    return { ok: true, prefs: data };
  } catch (e) {
    return { ok: false, message: 'Your preferences could not be saved. Check your connection and try again.' };
  }
}

export async function sendTestNotification() {
  try {
    const { supabase, user } = await signedIn();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
    const { data, error } = await supabase.rpc('send_my_test_notification');
    if (error) return refusal(error, 'The test could not be sent.');
    return { ok: true, queued: data && typeof data.queued === 'number' ? data.queued : 0 };
  } catch (e) {
    return { ok: false, message: 'The test could not be sent. Check your connection and try again.' };
  }
}

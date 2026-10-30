'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner, NOT_A_TEAM_OWNER_REFUSAL } from '../../lib/getCurrentTeamOwner';

/**
 * DATA CENTER -- Server Actions for connector keys. October 5, 2026.
 *
 * Two thin calls to two database functions, through the SESSION client:
 *   create_my_api_key(label)  reads auth.uid(); the caller's own key; at most
 *                             three live; returns the plaintext ONCE
 *   revoke_api_key(id)        the key's owner, or an officer for anyone's
 *
 * Two layers, like every write action: getCurrentTeamOwner() refuses a login
 * with no team_owners row (the read-only observer, or a login not yet linked
 * to a team) before anything is sent, and the DATABASE is still the real gate
 * and composes every other refusal; these hand its sentence back verbatim.
 * Refusals are RETURNED, not thrown (CLAUDE.md ground rule 9).
 */

export async function createConnectorKey(label) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
    if (!(await getCurrentTeamOwner())) return { ok: false, message: NOT_A_TEAM_OWNER_REFUSAL };

    const { data, error } = await supabase.rpc('create_my_api_key', {
      p_label: label ? String(label).slice(0, 60) : null,
    });
    if (error) return { ok: false, message: error.message || 'The key could not be created.' };
    if (!data || !data.ok) return { ok: false, message: (data && data.message) || 'The key could not be created.' };
    return { ok: true, key: data.key, id: data.id, prefix: data.key_prefix };
  } catch (e) {
    return { ok: false, message: 'The key could not be created. Check your connection and try again.' };
  }
}

export async function revokeConnectorKey(id) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
    if (!(await getCurrentTeamOwner())) return { ok: false, message: NOT_A_TEAM_OWNER_REFUSAL };

    const { data, error } = await supabase.rpc('revoke_api_key', { p_id: id });
    if (error) return { ok: false, message: error.message || 'The key could not be revoked.' };
    if (!data || !data.ok) return { ok: false, message: (data && data.message) || 'The key could not be revoked.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'The key could not be revoked. Check your connection and try again.' };
  }
}

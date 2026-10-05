'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

/**
 * DATA CENTER -- Server Actions for connector keys. October 5, 2026.
 *
 * Two thin calls to two database functions, through the SESSION client:
 *   create_my_api_key(label)  reads auth.uid(); the caller's own key; at most
 *                             three live; returns the plaintext ONCE
 *   revoke_api_key(id)        the key's owner, or an officer for anyone's
 *
 * The DATABASE is the gate and composes every refusal; these hand its sentence
 * back verbatim. Refusals are RETURNED, not thrown (CLAUDE.md ground rule 10).
 */

export async function createConnectorKey(label) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };

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

    const { data, error } = await supabase.rpc('revoke_api_key', { p_id: id });
    if (error) return { ok: false, message: error.message || 'The key could not be revoked.' };
    if (!data || !data.ok) return { ok: false, message: (data && data.message) || 'The key could not be revoked.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'The key could not be revoked. Check your connection and try again.' };
  }
}

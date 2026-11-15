'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

// THE WATCHLIST'S THREE WRITES -- UI test batch 22, November 15, 2026.
//
// Rule 7.9's own functions do the work: watchlist_remove(uuid) takes a player
// off, watchlist_restore(uuid) is the Undo bar (it brings back the same marker,
// at the same tier and with the same added date, within 15 minutes; test
// migration watchlist_01) and watchlist_set(uuid, text) changes who sees it
// (private, shared or league). Each resolves the team from auth.uid() and
// refuses a login with no team, so this runs on the SESSION client, never
// adminClient(): through the service role auth.uid() is NULL and every call
// would be refused.
//
// The three functions RAISE their refusals; this file turns each into a
// returned { ok: false, message } with the database's sentence (ground rule 9:
// a production build masks anything thrown out of a Server Action).

const TIERS = ['private', 'shared', 'league'];

function bad(message) {
  return { ok: false, message: message };
}

async function call(fn, args, fallback) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return bad(error.message || fallback);
    return { ok: true, data: data || null };
  } catch (e) {
    return bad('The watchlist could not be reached. Try again.');
  }
}

export async function removeFromWatchlist(playerId) {
  if (typeof playerId !== 'string' || !playerId) return bad('That player was not found.');
  const res = await call('watchlist_remove', { p_player_id: playerId }, 'He could not be taken off your watchlist.');
  if (!res.ok) return res;
  return { ok: true };
}

export async function restoreToWatchlist(playerId) {
  if (typeof playerId !== 'string' || !playerId) return bad('That player was not found.');
  const res = await call('watchlist_restore', { p_player_id: playerId }, 'He could not be put back.');
  if (!res.ok) return res;
  return { ok: true };
}

export async function setWatchTier(playerId, tier) {
  if (typeof playerId !== 'string' || !playerId) return bad('That player was not found.');
  if (TIERS.indexOf(tier) < 0) return bad('Choose private, shared or league.');
  const res = await call('watchlist_set', { p_player_id: playerId, p_visibility: tier }, 'Who sees it could not be changed.');
  if (!res.ok) return res;
  return { ok: true };
}

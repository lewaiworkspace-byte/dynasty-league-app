'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../lib/getCurrentTeamOwner';

// SHARED BY TWO SURFACES, WHICH IS WHY IT LIVES IN components/ RATHER THAN
// BESIDE ONE ROUTE.
//
// The team page mounts the directory read-only apart from your own card;
// /admin/owner-activity mounts the same directory with officer editing. Two
// copies of these actions, one per route, would be two places to keep in step
// with save_owner_profile()'s twenty-argument signature. A 'use server' module
// is a plain module and can live anywhere, so it sits with the components that
// call it.
//
// EVERY GATE IN THIS FILE IS IN THE DATABASE, NOT HERE.
//
// save_owner_profile() resolves the caller through auth.uid(), decides
// owner-or-officer itself, validates the time zone against pg_timezone_names,
// and writes the commissioner_actions row when an officer edits somebody
// else's card. owner_profile_raw() refuses a read of another owner's toggles
// the same way. The checks below exist for a readable message before a round
// trip, never as the only gate.
//
// RETURN, NEVER THROW -- the standing rule for every Server Action in this
// app. Next.js masks a thrown error's message in a production build, so a
// refusal the database worded carefully ("You may only edit your own owner
// information.") would reach the owner as the generic digest string. Returned
// values are not masked. Callers must check .ok.

/**
 * The directory read. Used by the page; also exported so a client component
 * can refresh after a save without a full route reload.
 *
 * @returns {Promise<{ok:true, rows:Array} | {ok:false, message:string}>}
 */
export async function loadOwnerDirectory() {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to see owner information.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('owner_directory');

  if (error) {
    return { ok: false, message: error.message || 'Owner information could not be loaded.' };
  }
  return { ok: true, rows: data || [] };
}

/**
 * Loads one owner's raw profile -- values PLUS the seven visibility toggles --
 * for the edit form, together with the time zone list the picker uses.
 *
 * Pass null for your own card. Passing another owner's id succeeds only for
 * the commissioner or co-commissioner; owner_profile_raw() refuses otherwise.
 *
 * The time zone list comes from the database rather than a constant in this
 * repo on purpose: edfl_time_zone_options() reads the same pg_timezone_names
 * that save_owner_profile() validates against, so the picker cannot offer a
 * value the save will reject.
 *
 * @returns {Promise<{ok:true, profile:object, timeZones:Array} | {ok:false, message:string}>}
 */
export async function loadOwnerProfileForEdit(ownerId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to edit owner information.' };
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: rows, error: profErr }, { data: zones, error: zoneErr }] = await Promise.all([
    supabase.rpc('owner_profile_raw', { p_owner_id: ownerId || null }),
    supabase.rpc('edfl_time_zone_options'),
  ]);

  if (profErr) {
    return { ok: false, message: profErr.message || 'That owner card could not be opened.' };
  }
  if (!rows || rows.length === 0) {
    return { ok: false, message: 'No owner profile exists for that owner.' };
  }
  // A failed zone list is not fatal -- the form still saves, the picker just
  // falls back to the value already stored. Losing the whole edit because a
  // dropdown could not be filled would be the worse outcome.
  return {
    ok: true,
    profile: rows[0],
    timeZones: zoneErr ? [] : zones || [],
    timeZonesError: zoneErr ? zoneErr.message : null,
  };
}

/**
 * Saves one owner's profile.
 *
 * The values object carries every field the form holds, including all seven toggles.
 * save_owner_profile() replaces the row wholesale rather than patching it, so
 * a field the form omits is CLEARED, not left alone. The dialog always sends
 * the complete set for that reason.
 *
 * @returns {Promise<{ok:true, ownerId:string} | {ok:false, message:string}>}
 */
export async function saveOwnerProfile(ownerId, values) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to edit owner information.' };
  }

  const v = values || {};
  const year = v.owner_since_year === '' || v.owner_since_year === null || v.owner_since_year === undefined
    ? null
    : Number(v.owner_since_year);

  if (year !== null && (Number.isNaN(year) || year < 2000 || year > 2100)) {
    return { ok: false, message: 'Owner since must be a year between 2000 and 2100.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('save_owner_profile', {
    p_owner_id: ownerId || null,
    p_full_name: v.full_name || null,
    p_contact_email: v.contact_email || null,
    p_phone: v.phone || null,
    p_sleeper_username: v.sleeper_username || null,
    p_discord_username: v.discord_username || null,
    p_whatsapp_name: v.whatsapp_name || null,
    p_time_zone: v.time_zone || null,
    p_preferred_contact: v.preferred_contact || null,
    p_favorite_nfl_team: v.favorite_nfl_team || null,
    p_owner_since_year: year,
    p_bio: v.bio || null,
    p_open_to_trade_talks: v.open_to_trade_talks !== false,
    p_show_full_name: v.show_full_name !== false,
    p_show_contact_email: v.show_contact_email === true,
    p_show_phone: v.show_phone === true,
    p_show_sleeper_username: v.show_sleeper_username !== false,
    p_show_discord_username: v.show_discord_username !== false,
    p_show_whatsapp_name: v.show_whatsapp_name !== false,
    p_show_time_zone: v.show_time_zone !== false,
  });

  if (error) {
    // The database's wording is the useful one -- it names the field and, for
    // a time zone, echoes the value it refused. Pass it through untouched.
    return { ok: false, message: error.message || 'The save was refused and nothing was changed.' };
  }

  // BOTH surfaces carry the directory, and every team page carries it rather
  // than just this owner's own, so the route pattern is revalidated rather
  // than one resolved page -- the same reasoning as executeCut in actions.js.
  // Missing the admin path is how an officer edits a card, returns to the page
  // he edited it from, and sees what he replaced.
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/admin/owner-activity');

  return { ok: true, ownerId: data };
}

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// INSIDER THREAT -- Rule 7.9, September 19 2026. Spec v0.8 sections 4.3-4.5.
//
// EVERY RULE LIVES IN THE DATABASE. insider_submit() checks who is signed in,
// that a third-party claim is a leak and nothing stronger (IT-3), that the
// direction fits the subject (a pick is acquired or shopped, a prospect is
// only ever drafted), that the actor actually holds what he is shopping, and
// it places the 14-day block on a player you shop (TB-15) -- inside the same
// transaction, by the app's own gated path, never by Dianna's publisher
// (spec 4.5). Nothing here mirrors any of that; a copy would drift.
//
// RETURN, NEVER THROW. Same reason as app/team/[teamId]/actions.js: a thrown
// error is masked in production and the owner sees a generic string instead
// of the sentence the database wrote for him.

/**
 * @param {object} input
 * @param {'player'|'pick'|'prospect'} input.subjectKind
 * @param {string} input.subjectId
 * @param {'acquire'|'shop'|'sign_fa'|'release'|'draft'} input.direction
 * @param {string|null} input.aboutTeamId  null = my own move
 * @param {'leak'|'off_record'|'on_record'} input.veracity
 * @param {string} input.willingToGive
 * @param {string} input.seeking
 * @param {'now'|'tonight'|'this_week'} input.delay
 * @returns {Promise<{ok:true, data:object} | {ok:false, message:string}>}
 */
export async function insiderSubmit(input) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to tell Dianna anything.' };
  }
  if (!input || !input.subjectId) {
    return { ok: false, message: 'Pick a player, a pick or a prospect first.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('insider_submit', {
    p_subject_kind: input.subjectKind,
    p_subject_id: input.subjectId,
    p_direction: input.direction,
    p_about_team_id: input.aboutTeamId || null,
    p_veracity: input.veracity,
    p_willing_to_give: input.willingToGive && input.willingToGive.trim() ? input.willingToGive.trim() : null,
    p_seeking: input.seeking && input.seeking.trim() ? input.seeking.trim() : null,
    p_delay: input.delay,
  });

  if (error) {
    return { ok: false, message: error.message || 'Dianna did not take that. Nothing was recorded.' };
  }

  // The Media tab (this page) and, when a block was placed, every surface that
  // draws the block. The route pattern, for the same reason executeCut gives.
  revalidatePath('/team/[teamId]', 'page');
  return { ok: true, data: data };
}

/**
 * Withdraw one of my own submissions. Before it prints, it never prints. After,
 * the channel keeps it (spec 12) and it leaves Mort's Thoughts. A block the
 * submission placed stays up -- that is the owner's to take down (TB-4).
 * @returns {Promise<{ok:true, data:object} | {ok:false, message:string}>}
 */
export async function insiderWithdraw(submissionId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('insider_withdraw', { p_submission_id: submissionId });
  if (error) {
    return { ok: false, message: error.message || 'That could not be withdrawn.' };
  }
  revalidatePath('/team/[teamId]', 'page');
  return { ok: true, data: data };
}

/**
 * The form's player finder. search_players() is the app's one player search
 * (Player Search, September 8) and clamps to 50 rows itself; this passes the
 * same cap the /search page does. Returns the rows the form needs to label a
 * choice: name, position, NFL club and who holds him in the EDFL.
 * @returns {Promise<{ok:true, rows:Array} | {ok:false, message:string}>}
 */
export async function searchPlayersForDianna(query) {
  const q = (query || '').trim();
  if (q.length < 2) return { ok: true, rows: [] };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('search_players', { p_query: q, p_limit: 50 });
  if (error) {
    return { ok: false, message: error.message || 'Search failed.' };
  }
  return {
    ok: true,
    rows: (data || []).map((r) => ({
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      nfl_team: r.nfl_team,
      edfl_team_id: r.edfl_team_id,
      edfl_team: r.edfl_team,
      is_free_agent: Boolean(r.is_free_agent),
    })),
  };
}

/**
 * Unused draft picks, for the pick subject. draft_pick_board is the same
 * board /draft-picks draws; only picks not yet used are offered.
 * @returns {Promise<{ok:true, rows:Array} | {ok:false, message:string}>}
 */
export async function listPicksForDianna() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('draft_pick_board')
    .select('pick_id, season_year, round, pick_label, original_team_name, current_team_id, current_team_name, draft_completed')
    .eq('draft_completed', false)
    .order('sort_key')
    .limit(200);
  if (error) {
    return { ok: false, message: error.message || 'Picks could not be loaded.' };
  }
  return {
    ok: true,
    rows: (data || []).map((r) => ({
      pick_id: r.pick_id,
      label: r.season_year + ' ' + r.pick_label + ' (' + r.original_team_name + ')',
      current_team_id: r.current_team_id,
      current_team_name: r.current_team_name,
    })),
  };
}

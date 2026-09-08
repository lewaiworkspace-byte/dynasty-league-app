'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { MIN_QUERY_LENGTH, RESULT_CAP } from '../../lib/playerSearch';

// PLAYER SEARCH -- the one call behind /search and the app bar's box.
//
// search_players() has existed since August 27, 2026 and had no caller in the
// schema and no caller in this repo: verified this session, zero rows from
// pg_depend over pg_rewrite and zero function bodies mentioning it. Six
// revisions of the reference docs called it "the card's entry point" while the
// only way to reach a player card was to click a name already drawn on a page
// you were already looking at. This file is that entry point.
//
// createSupabaseServerClient, NOT adminClient(). The function is granted to
// authenticated and to service_role, and it is not SECURITY DEFINER -- so it
// runs with the caller's privileges and RLS applies as them. A service-role
// call would work by grant and would be reading as nobody, which is not what
// this is. Same client as searchFreeAgents next door, for the same reason.
//
// ONE RPC AND NOTHING ELSE. Do not reach past it to players with a select:
// that table is 3,253 rows, /admin/fix-contracts already failed that way once,
// and every one of the three defects the September 8 rebuild fixed --
// a cut player reporting a current team, punctuation killing the match,
// twenty indistinguishable duplicate names -- lives inside this function.
// A hand-rolled ilike here would reintroduce all three.
//
// Returns a refusal, never throws (ground rule 9).

export async function searchPlayers(query) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'Sign in as a team owner to search for players.' };
  }

  const text = (query || '').trim();

  // Not a mirror of the function's minimum -- the function measures two
  // characters on the NORMALISED query, so "..." is short there and long here.
  // This only decides whether a request is worth sending at all; a query that
  // clears this and not the other comes back empty, which is honest.
  if (text.length < MIN_QUERY_LENGTH) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('search_players', {
    p_query: text,
    p_limit: RESULT_CAP,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true, data: data || [] };
}

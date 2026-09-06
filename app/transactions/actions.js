'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// LEAGUE TRANSACTION LOG -- every roster move in the league, for every member.
//
// A LEAGUE SURFACE, NOT AN ADMIN ONE. The gate is "is this a logged-in league
// member", not "is this an officer": every owner sees the same rows in the same
// order. league_transactions() is granted to authenticated and to nobody else,
// and the log excludes every per-viewer branch, so there is nothing here that
// renders differently depending on who is asking.
//
// createSupabaseServerClient, not the shared anon client in lib/supabaseClient:
// league_transactions() has no anon grant, so an anon read is refused by the
// database rather than returning an empty list.
//
// Returns { ok, ... } and never throws.

const PAGE_SIZE = 100;

function refusal() {
  return { ok: false, message: 'Sign in to see the league transaction log.' };
}

export async function loadTransactionKinds() {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('league_transaction_kinds');
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data || [] };
}

export async function loadTeamsForFilter() {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .order('name');
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data || [] };
}

// One reader for the whole page. Paging is by cursor rather than offset, so a
// row arriving while somebody is reading cannot shift the next page and cause a
// repeat or a skip -- which matters here because 130 rookie signings share a
// single timestamp to the microsecond.
export async function loadTransactionPage(filters) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const f = filters || {};
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('league_transactions', {
    p_kinds: f.kinds && f.kinds.length > 0 ? f.kinds : null,
    p_from: f.from ? f.from : null,
    p_to: f.to ? f.to : null,
    p_search: f.search && f.search.trim() ? f.search.trim() : null,
    p_team_id: f.teamId ? f.teamId : null,
    p_sort: f.sort || 'newest',
    p_limit: f.limit || PAGE_SIZE,
    p_cursor_at: f.cursorAt || null,
    p_cursor_id: f.cursorId || null,
  });

  if (error) return { ok: false, message: error.message };

  const rows = data || [];
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    ok: true,
    data: {
      rows: rows,
      // A cursor is only a paging contract for the time sorts; sorting by player
      // or team is a browsing affordance and a cursor over a non-unique name
      // would be meaningless. The database refuses that combination outright.
      cursorAt: last && (f.sort === 'newest' || f.sort === 'oldest' || !f.sort) ? last.occurred_at : null,
      cursorId: last && (f.sort === 'newest' || f.sort === 'oldest' || !f.sort) ? last.log_id : null,
      pageSize: f.limit || PAGE_SIZE,
    },
  };
}

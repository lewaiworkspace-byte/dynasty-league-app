'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// THE BOOK'S WRITES -- UI test batch 24, November 15, 2026 (test site only, BT-9).
//
// Four calls, each to the database function that decides it (test database,
// migrations book_02, book_06 and book_07):
//   book_place_bet(line, market, side, stake)  one single bet
//   book_deposit(amount)                       Owner Cash into the betting account
//   book_cash_out(amount)                      out, buy-in first, profit taxed
//   book_cash_out_preview(amount)              what a cash-out would pay (no write)
// Each resolves the team from auth.uid() and refuses a login with no team, so they
// run on the SESSION client, never adminClient() (through the service role
// auth.uid() is NULL). getCurrentTeamOwner() is checked first as well: the
// observer login has no team and is refused here before the database is asked.
//
// The functions RETURN their refusals as { ok: false, reason, ... } rather than
// raising them; this file passes that object through unchanged and the screen
// words it (bookFormat.js refusalText). A transport failure is returned too, never
// thrown (ground rule 9).

function bad(reason, extra) {
  return Object.assign({ ok: false, reason: reason }, extra || {});
}

function money(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  const c = Math.round(n * 100);
  if (Math.abs(c - n * 100) > 1e-6) return null; // more than two places
  return c / 100;
}

async function call(fn, args) {
  const owner = await getCurrentTeamOwner();
  if (!owner || !owner.team_id) return bad('no_team');
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return bad('error', { message: error.message || 'The Book could not be reached.' });
    if (!data || typeof data !== 'object') return bad('error', { message: 'The Book sent back nothing.' });
    return data;
  } catch (e) {
    return bad('error', { message: 'The Book could not be reached. Try again.' });
  }
}

const MARKETS = ['spread', 'moneyline', 'total', 'home_total', 'away_total'];
const SIDES = ['home', 'away', 'over', 'under'];

export async function placeBet(lineId, market, side, stake) {
  const id = Number(lineId);
  if (!Number.isInteger(id) || id <= 0) return bad('no_line');
  if (MARKETS.indexOf(market) < 0 || SIDES.indexOf(side) < 0) return bad('bad_market');
  const s = money(stake);
  if (s === null) return bad('bad_stake');
  return call('book_place_bet', { p_line_id: id, p_market: market, p_side: side, p_stake: s });
}

export async function depositToBook(amount) {
  const a = money(amount);
  if (a === null) return bad('bad_amount');
  return call('book_deposit', { p_amount: a });
}

export async function cashOutOfBook(amount) {
  const a = money(amount);
  if (a === null) return bad('bad_amount');
  return call('book_cash_out', { p_amount: a });
}

export async function previewCashOut(amount) {
  const a = money(amount);
  if (a === null) return bad('bad_amount');
  return call('book_cash_out_preview', { p_amount: a });
}

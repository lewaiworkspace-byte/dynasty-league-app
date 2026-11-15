'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// THE BOOK'S WRITES -- UI test batch 24, November 15, 2026 (test site only, BT-9);
// batch 25 (Phase 2) replaced the single-bet call with book_place_ticket.
//
// Four calls, each to the database function that decides it (test database,
// migrations book_02, book_06, book_07 and book_09_phase2_engine):
//   book_place_ticket(legs, stake)             a single or a parlay (2-5 legs)
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

// One single or a parlay of up to five legs (UI test batch 25). Each leg is a game
// line { line_id, market, side } or a player line { prop_id, side }. Game singles
// go through here too, so one database function judges every bet
// (book_place_ticket; book_place_bet is its one-leg wrapper for older callers).
export async function placeTicket(legs, stake) {
  if (!Array.isArray(legs) || legs.length === 0) return bad('no_legs');
  if (legs.length > 5) return bad('too_many_legs');
  const clean = [];
  for (let i = 0; i < legs.length; i += 1) {
    const l = legs[i] || {};
    if (l.prop_id !== undefined && l.prop_id !== null) {
      const id = Number(l.prop_id);
      if (!Number.isInteger(id) || id <= 0) return bad('no_line', { leg: i + 1 });
      if (l.side !== 'over' && l.side !== 'under') return bad('bad_market', { leg: i + 1 });
      clean.push({ prop_id: id, side: l.side });
    } else {
      const id = Number(l.line_id);
      if (!Number.isInteger(id) || id <= 0) return bad('no_line', { leg: i + 1 });
      if (MARKETS.indexOf(l.market) < 0 || SIDES.indexOf(l.side) < 0) return bad('bad_market', { leg: i + 1 });
      clean.push({ line_id: id, market: l.market, side: l.side });
    }
  }
  const s = money(stake);
  if (s === null) return bad('bad_stake');
  return call('book_place_ticket', { p_legs: clean, p_stake: s });
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

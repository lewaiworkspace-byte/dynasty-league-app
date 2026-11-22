/**
 * THE LEAGUE PAGE'S SHAPING -- November 14, 2026 (UI test batch 15).
 *
 * Pure functions over the rows app/league/page.js loaded. Nothing here reads
 * the clock, a database or a cookie, formats a timestamp or decides a league
 * rule: page.js reads the clock once and hands it in, every date label is the
 * league_calendar view's own pre-rendered Eastern string, and every figure is
 * a column some view returned.
 *
 * Lewis's choices, all from the Claude Design canvas "EDFL League tab (test
 * site)" (Option B, approved Nov 14) and his note of the same morning:
 *   - Key Injuries: rostered players with a designation, most 2026 EDFL points
 *     first.
 *   - Recent Transactions: signings and practice-squad promotions ranked by
 *     next week's projection; everything else ("Other Notable Moves") by season
 *     average per game; a player already listed in the first group is not
 *     repeated in the second.
 *   - Key Dates: one-off dates only, never the weekly "Week N begins" rows.
 * Which kinds count as a signing, and the seven-day window, are display
 * choices made in the design chat, not league rules; they live here so the
 * page has one place to change them.
 */

// Recent means the last seven days (design chat, Nov 14).
export const RECENT_DAYS = 7;

// How many rows each list shows. Summaries, not the full pages.
export const LIST_ROWS = 5;

// Kinds that are not roster moves at all: a bid that lost, an offer pulled.
// The full Transactions page keeps them; this summary does not.
const NOT_A_MOVE = { fa_offer_lost: true, fa_offer_withdrawn: true };

// A player joining a roster. An extension is a signing kind on the log
// (detail.extends_contract_id) but Lewis grouped extensions with the moves
// ranked by season average, so it is excluded below.
const SIGNING_KINDS = {
  signed_free_agent: true,
  signed_auction: true,
  signed_rookie: true,
  signed_practice_squad: true,
  waived_claimed: true,
  poached: true,
};

function detailOf(row) {
  return row && row.detail && typeof row.detail === 'object' ? row.detail : {};
}

/**
 * True for a signing or a promotion from the practice squad -- the moves Lewis
 * ranks by next week's projection. A promotion is a roster_active row whose
 * detail says it came from the taxi slot (the log's own from_status field).
 */
export function isSigningOrPromotion(row) {
  if (!row) return false;
  const d = detailOf(row);
  if (SIGNING_KINDS[row.kind]) return !d.extends_contract_id;
  if (row.kind === 'roster_active') return d.from_status === 'taxi';
  return false;
}

export function isRosterMove(row) {
  return Boolean(row) && !NOT_A_MOVE[row.kind] && Boolean(row.player_id);
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Null sorts last, then the newer move first, so the order is total.
function byMetricDesc(a, b) {
  if (a.metric === null && b.metric === null) return b.at - a.at;
  if (a.metric === null) return 1;
  if (b.metric === null) return -1;
  if (b.metric !== a.metric) return b.metric - a.metric;
  return b.at - a.at;
}

// Each player once, on his newest move. rows arrive newest first.
function newestPerPlayer(rows) {
  const seen = {};
  const out = [];
  rows.forEach(function (r) {
    if (seen[r.player_id]) return;
    seen[r.player_id] = true;
    out.push(r);
  });
  return out;
}

/**
 * The two transaction lists.
 *   rows      league_transaction_log rows, newest first, already filtered to
 *             the window by the query
 *   projById  player_id -> next week's proj_points (missing = no projection)
 *   fppgById  player_id -> 2026 points per game
 * Returns { signings, others, projWeek } with each entry carrying `metric`
 * (null when the player has none) and `metricKind` ('proj' or 'avg').
 */
export function transactionGroups(rows, projById, fppgById, limit) {
  const n = limit || LIST_ROWS;
  const moves = (rows || []).filter(isRosterMove).map(function (r) {
    return Object.assign({}, r, { at: Date.parse(r.occurred_at) || 0 });
  });

  const sign = newestPerPlayer(moves.filter(isSigningOrPromotion))
    .map(function (r) {
      return Object.assign({}, r, {
        metric: num(projById[r.player_id]),
        metricKind: 'proj',
      });
    })
    .sort(byMetricDesc)
    .slice(0, n);

  const listed = {};
  sign.forEach(function (r) {
    listed[r.player_id] = true;
  });

  const others = newestPerPlayer(
    moves.filter(function (r) {
      return !isSigningOrPromotion(r);
    })
  )
    .filter(function (r) {
      return !listed[r.player_id];
    })
    .map(function (r) {
      return Object.assign({}, r, {
        metric: num(fppgById[r.player_id]),
        metricKind: 'avg',
      });
    })
    .sort(byMetricDesc)
    .slice(0, n);

  return { signings: sign, others: others };
}

/**
 * Key Injuries: rows of league_injury_report that are rostered and carry a
 * designation, with 2026 points attached, most points first (null last, then
 * by name so two renders cannot differ).
 */
export function keyInjuries(rows, pointsById, limit) {
  const n = limit || LIST_ROWS;
  return (rows || [])
    .map(function (r) {
      return Object.assign({}, r, { points: num(pointsById[r.player_id]) });
    })
    .sort(function (a, b) {
      if (a.points === null && b.points === null) {
        return String(a.full_name).localeCompare(String(b.full_name));
      }
      if (a.points === null) return 1;
      if (b.points === null) return -1;
      if (b.points !== a.points) return b.points - a.points;
      return String(a.full_name).localeCompare(String(b.full_name));
    })
    .slice(0, n);
}

/**
 * The next Key Dates. A window that is open now is listed at the day it closes
 * ("Poaching open" until Dec 12); everything else at the day it starts.
 *   rows      league_calendar rows with source 'event', ordered by starts_at
 *   nowMs     the page's one clock reading
 * Days to go are counted in page.js against today's Eastern date.
 */
export function keyDates(rows, nowMs, limit) {
  const n = limit || LIST_ROWS;
  const out = [];
  (rows || []).forEach(function (e) {
    const startMs = Date.parse(e.starts_at);
    const endMs = e.ends_at ? Date.parse(e.ends_at) : null;
    if (startMs > nowMs) {
      out.push({
        id: e.entry_id,
        title: e.title,
        dateKey: e.local_date,
        dayLabel: e.day_label,
        timeLabel: e.time_label,
        provisional: Boolean(e.is_provisional),
        closes: false,
        sortMs: startMs,
      });
    } else if (endMs !== null && endMs > nowMs) {
      out.push({
        id: e.entry_id,
        title: e.title,
        dateKey: e.end_local_date,
        dayLabel: e.end_day_label,
        timeLabel: null,
        provisional: Boolean(e.is_provisional),
        closes: true,
        sortMs: endMs,
      });
    }
  });
  out.sort(function (a, b) {
    return a.sortMs - b.sortMs;
  });
  return out.slice(0, n);
}

// "Sat, Dec 12" -> "Dec 12": the view's own label with the weekday dropped.
export function shortDay(label) {
  if (!label) return '';
  const i = label.indexOf(', ');
  return i >= 0 ? label.slice(i + 2) : label;
}

// "Sat, Dec 12" -> "Sat".
export function weekdayOf(label) {
  if (!label) return '';
  const i = label.indexOf(', ');
  return i >= 0 ? label.slice(0, i) : '';
}

/**
 * The standings bar for one team, in whole numbers (Lewis: "round down to
 * whole numbers"), either per game or season totals. Truncated toward zero,
 * so a -56.21 difference reads -56, never -57. Returns null before a game is
 * played: "no games yet" is not a bar of zeroes (money-and-dates.md).
 */
export function standingsBar(r, perGame) {
  const g = num(r.games);
  const pf = num(r.points_for);
  const pa = num(r.points_against);
  const diff = num(r.point_differential);
  if (!g || g <= 0 || pf === null || pa === null) return null;
  const k = perGame ? g : 1;
  const forV = pf / k;
  const againstV = pa / k;
  const diffV = diff !== null ? diff / k : forV - againstV;
  const total = forV + againstV;
  return {
    forText: Math.trunc(forV).toLocaleString('en-US'),
    againstText: Math.trunc(againstV).toLocaleString('en-US'),
    diff: Math.trunc(diffV),
    share: total > 0 ? (forV / total) * 100 : 50,
  };
}

export function signed(n) {
  if (n > 0) return '+' + n.toLocaleString('en-US');
  if (n < 0) return '−' + Math.abs(n).toLocaleString('en-US');
  return '0';
}

/**
 * SLEEPER WEEKLY PROJECTIONS -- the fetch half.
 *
 * Phase 2G-2, September 20, 2026.
 *
 * WHAT THIS IS AND IS NOT. This module pulls Rotowire's projected COMPONENT
 * STATS for a week out of Sleeper and hands them to the database untouched.
 * It does not score anything. edfl_sync_week_projections() does the scoring,
 * against edfl_scoring_settings, for the same reason the score sync works
 * that way: the league's rules live in one table and the app does not carry
 * a second copy of them.
 *
 * WHY NOT SLEEPER'S OWN pts_ppr. Because EDFL is nothing like PPR. The league
 * pays 1 point per first down (passing, rushing and receiving), 0.25 per
 * completion, -0.05 per incompletion, -1 per sack, 1/12 per passing yard and
 * 5 -- not 6 -- for a rushing touchdown. A quarterback's pts_ppr lands around
 * 19 where his EDFL line lands around 57. Printing pts_ppr next to an EDFL
 * score would not be a projection, it would be a different sport.
 *
 * THE ENDPOINT IS UNDOCUMENTED. api.sleeper.app/projections/... is not in
 * Sleeper's published API and carries no compatibility promise. Everything
 * below therefore degrades rather than throws: a position that 404s is
 * skipped and reported, and a week with no projections at all leaves the
 * Matchup page showing actual points with the projection column dashed out.
 * A missing projection must never be able to take a page down.
 *
 * VERIFIED 2026-09-20 against the live endpoint: the array elements carry
 * `player_id` (Sleeper's, which is players.sleeper_player_id), a `stats`
 * object, `category: "proj"`, and `company: "rotowire"`. Players with no
 * projection still appear, carrying only `adp_dd_ppr` -- those are filtered
 * out here rather than stored as a 0.00, because a stored zero and "no
 * projection" have to stay distinguishable on the page.
 */

const PROJ_BASE = 'https://api.sleeper.app/projections/nfl/';

// The five positions EDFL starts. No DEF: the best-ball template is
// 1 QB, 2 RB, 4 WR, 2 TE, 2 FLEX, 1 K (ruling BB-3) and nothing else can
// occupy a slot, so pulling anything more is bandwidth for no purpose.
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

// A projection with nothing but an average-draft-position figure in it is
// Rotowire saying "this player is not projected to play", not "zero points".
// Storing it would fill a bench with confident zeroes.
const NON_STATS = new Set(['adp_dd_ppr', 'pos_adp_dd_ppr', 'gp']);

function hasRealProjection(stats) {
  if (!stats || typeof stats !== 'object') return false;
  const keys = Object.keys(stats);
  for (let i = 0; i < keys.length; i += 1) {
    if (!NON_STATS.has(keys[i])) return true;
  }
  return false;
}

async function fetchPosition(season, week, position) {
  const url =
    PROJ_BASE +
    season +
    '/' +
    week +
    '?season_type=regular&position[]=' +
    encodeURIComponent(position);

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return { position, ok: false, message: 'Sleeper returned ' + res.status + ' for ' + position, rows: [] };
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    return { position, ok: false, message: 'Sleeper did not return an array for ' + position, rows: [] };
  }

  const rows = [];
  for (let i = 0; i < body.length; i += 1) {
    const e = body[i];
    if (!e || !e.player_id) continue;
    if (!hasRealProjection(e.stats)) continue;
    // Only the two fields the database reads. The rest of Rotowire's envelope
    // -- the nested player object, the channel ids, the ADP -- is not stored,
    // because player identity already lives in `players` and a second copy of
    // it would be a second thing to keep true.
    rows.push({ player_id: String(e.player_id), stats: e.stats });
  }
  return { position, ok: true, message: null, rows };
}

/**
 * Pull one week of projections for every EDFL-startable position.
 *
 * Returns { rows, positionsOk, positionsFailed, notes } and NEVER throws.
 * `rows` is the flat array to hand to edfl_sync_week_projections().
 */
export async function fetchWeekProjections(season, week) {
  const results = await Promise.all(
    POSITIONS.map(function (p) {
      return fetchPosition(season, week, p).catch(function (e) {
        return { position: p, ok: false, message: e.message, rows: [] };
      });
    })
  );

  const rows = [];
  const positionsOk = [];
  const positionsFailed = [];
  const notes = [];
  const seen = new Set();

  results.forEach(function (r) {
    if (!r.ok) {
      positionsFailed.push(r.position);
      notes.push(r.message);
      return;
    }
    positionsOk.push(r.position);
    r.rows.forEach(function (row) {
      // A player listed at two positions would otherwise arrive twice and the
      // upsert would keep whichever landed last. First wins, deterministically.
      if (seen.has(row.player_id)) return;
      seen.add(row.player_id);
      rows.push(row);
    });
  });

  return { rows, positionsOk, positionsFailed, notes };
}

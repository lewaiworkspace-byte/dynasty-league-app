/**
 * THE INJURY REPORT'S SHAPING -- November 15, 2026 (UI test batch 19).
 *
 * Pure functions over the rows app/injury-report/page.js loaded. Nothing here
 * reads the clock, a database or a cookie: page.js reads the clock once and
 * hands it in, and every date label is made here, on the server, so the client
 * view formats nothing (money-and-dates.md).
 *
 * Lewis's choices (Claude Design canvas "EDFL Injury Report (League Office)",
 * Nov 14-15, 2026, and his comments on it):
 *   - One page, three views switched by tabs at the top: League View, Team View
 *     and Return View. Team View is the default, and it shows one team at a
 *     time, opening on the owner's own team.
 *   - Lists open in 2026 EDFL points order, like the League page's Key Injuries
 *     box. The other sorts are the owner's choice on the page.
 *   - A team's injury impact is POINTS PER GAME, not season points ("it shows
 *     impact better"): the per-game averages of its players who are out --
 *     every designation the vocabulary reads as serious (IR, PUP, Out and the
 *     rest), plus Doubtful -- added together. Questionable players play more
 *     often than not and are left out.
 * None of this is a league rule. A designation decides nothing here (the
 * September 8 ruling in lib/injuryReport.js), and the return buckets below are
 * a reading aid, not a prediction the app makes.
 */

import { designationFor, DESIGNATIONS, CHANGE_LABELS, rosterSlotLabel } from '../../lib/injuryReport';
import { formatMonthDay } from '../../lib/formatDate';

// The roster spot as the page words it: "IR slot", so it never reads like the
// IR designation beside it (canvas, Nov 14).
const SLOT_LABELS = { active: 'Active', ir: 'IR slot', taxi: 'Practice squad' };

// Severity at or below Doubtful's counts as "out" for the team's points per
// game. Read from the vocabulary module, never from a status string.
const OUT_SEVERITY = DESIGNATIONS.Doubtful.severity;

// The day after which a return estimate means "not this season": ESPN files a
// season-ending injury at a placeholder date in February. Display choice
// (design chat, Nov 14): any estimate after January of the next year.
function doneAfterKey(season) {
  return season + 1 + '-01-31';
}

// How many league weeks the Return View draws one column each for.
const WEEK_COLUMNS = 6;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The return buckets for the Return View: one per league week still to finish,
 * then "After Week N", then "Done for <season>", then "No estimate".
 *   weeks       league_weeks rows (week_number, last_game_at), any order
 *   endKeyOf    function(timestamp) -> 'YYYY-MM-DD' in Eastern time
 *   todayKey    today's Eastern date
 * Returns [{ key, label, short, endKey }] in reading order.
 */
export function returnBuckets(weeks, endKeyOf, todayKey, season) {
  const out = [];
  const ordered = (weeks || [])
    .filter(function (w) { return w && w.last_game_at; })
    .map(function (w) {
      return { week: w.week_number, endKey: endKeyOf(w.last_game_at) };
    })
    .filter(function (w) { return w.endKey && w.endKey >= todayKey; })
    .sort(function (a, b) { return a.week - b.week; })
    // At most WEEK_COLUMNS weeks get a column of their own; later weeks fold
    // into "After Week N", so the chart stays readable on a phone in September.
    .slice(0, WEEK_COLUMNS);
  ordered.forEach(function (w) {
    out.push({ key: 'w' + w.week, label: 'Week ' + w.week, short: 'Wk ' + w.week, endKey: w.endKey });
  });
  const lastWeek = ordered.length
    ? ordered[ordered.length - 1].week
    : (weeks || []).reduce(function (m, w) {
      return w && w.week_number > m ? w.week_number : m;
    }, 0);
  out.push({ key: 'after', label: lastWeek ? 'After Week ' + lastWeek : 'Later', short: lastWeek ? 'After Wk ' + lastWeek : 'Later', endKey: doneAfterKey(season) });
  out.push({ key: 'done', label: 'Done for ' + season, short: 'Done for ' + season, endKey: null });
  out.push({ key: 'none', label: 'No estimate', short: 'No estimate', endKey: null });
  return out;
}

function bucketFor(retKey, buckets, todayKey) {
  if (!retKey) return 'none';
  const eff = retKey < todayKey ? todayKey : retKey;
  for (let i = 0; i < buckets.length; i += 1) {
    const b = buckets[i];
    if (b.endKey && eff <= b.endKey) return b.key;
  }
  return 'done';
}

/**
 * Flattens one league_injury_report row with its points and prognosis.
 *   r          the report row
 *   stat       { fantasy_points, games, fppg } or undefined
 *   prog       { agent_est_return_text, agent_est_return_date, espn_est_return_date } or undefined
 *   ctx        { abbrevById, buckets, todayKey, progLoaded }
 */
export function shapeInjury(r, stat, prog, ctx) {
  const d = designationFor(r.injury_status);
  const hurt = Boolean(d);
  const points = stat ? num(stat.fantasy_points) : null;
  const games = stat ? num(stat.games) : null;
  const fppg = stat ? num(stat.fppg) : null;

  let retKey = null;
  let backText = null;
  let backDone = false;
  let bucket = null;
  if (hurt) {
    const agentDate = prog && prog.agent_est_return_date ? String(prog.agent_est_return_date).slice(0, 10) : null;
    const espnDate = prog && prog.espn_est_return_date ? String(prog.espn_est_return_date).slice(0, 10) : null;
    retKey = agentDate || espnDate;
    bucket = bucketFor(retKey, ctx.buckets, ctx.todayKey);
    backDone = bucket === 'done';
    if (!ctx.progLoaded) {
      backText = 'Return estimate unavailable';
    } else if (prog && prog.agent_est_return_text) {
      backText = String(prog.agent_est_return_text);
    } else if (backDone) {
      backText = 'Done for the season';
    } else if (retKey) {
      backText = 'Expected back ' + formatMonthDay(retKey);
    } else {
      backText = 'No return estimate yet';
    }
  }

  return {
    id: r.player_id,
    name: r.full_name || '',
    pos: r.position || '',
    nfl: r.nfl_team || '',
    hurt: hurt,
    status: d ? d.label : 'Cleared',
    statusFull: d ? d.full : 'Cleared',
    tone: d ? d.tone : 'good',
    severity: d ? d.severity : 999,
    out: Boolean(d) && d.severity <= OUT_SEVERITY,
    injury: r.injury_body_part || '',
    prev: r.prev_injury_status ? (designationFor(r.prev_injury_status) || {}).label || r.prev_injury_status : '',
    teamId: r.edfl_team_id || null,
    team: r.edfl_team || '',
    abbr: r.edfl_team_id && ctx.abbrevById[r.edfl_team_id] ? ctx.abbrevById[r.edfl_team_id] : '',
    rostered: Boolean(r.is_rostered),
    slot: r.edfl_roster_status || '',
    slotLabel: SLOT_LABELS[r.edfl_roster_status] || rosterSlotLabel(r.edfl_roster_status),
    change: r.change_flag || '',
    changeLabel: r.change_flag ? CHANGE_LABELS[r.change_flag] || r.change_flag : '',
    changedAt: r.injury_changed_at || '',
    changedText: r.injury_changed_at ? formatMonthDay(r.injury_changed_at) : '',
    points: points,
    games: games,
    fppg: fppg,
    retKey: retKey,
    bucket: bucket,
    backText: backText,
    backDone: backDone,
  };
}

/**
 * One summary per team for Team View, from every rostered row (hurt or
 * cleared). Teams with nobody hurt are still listed, so the picker always
 * shows the whole league.
 *   teams   [{ id, abbrev, name }]
 */
export function teamSummaries(rows, teams) {
  const byId = {};
  (teams || []).forEach(function (t) {
    byId[t.id] = {
      id: t.id,
      abbr: t.abbrev || '',
      name: t.name || '',
      hurt: 0,
      cleared: 0,
      ppgOut: 0,
      biggest: null,
      counts: {},
    };
  });
  (rows || []).forEach(function (r) {
    if (!r.rostered || !r.teamId || !byId[r.teamId]) return;
    const t = byId[r.teamId];
    if (!r.hurt) {
      if (r.change === 'cleared') t.cleared += 1;
      return;
    }
    t.hurt += 1;
    t.counts[r.status] = (t.counts[r.status] || 0) + 1;
    if (r.out && r.fppg !== null) {
      t.ppgOut += r.fppg;
      if (!t.biggest || r.fppg > t.biggest.fppg) t.biggest = { name: r.name, fppg: r.fppg };
    }
  });
  const list = Object.keys(byId).map(function (k) {
    const t = byId[k];
    t.ppgOut = Math.round(t.ppgOut * 10) / 10;
    return t;
  });
  // Rank by points per game out, most first; a tie shares the better rank.
  const sorted = list.slice().sort(function (a, b) { return b.ppgOut - a.ppgOut; });
  sorted.forEach(function (t, i) {
    const prev = sorted[i - 1];
    t.rank = prev && prev.ppgOut === t.ppgOut ? prev.rank : i + 1;
  });
  return list;
}

/** Status counts for a set of rows: the bar, its legend and the chips. */
export function statusCounts(rows) {
  const by = {};
  const out = [];
  (rows || []).forEach(function (r) {
    if (!r.hurt) return;
    if (!by[r.status]) {
      by[r.status] = { label: r.status, tone: r.tone, severity: r.severity, n: 0 };
      out.push(by[r.status]);
    }
    by[r.status].n += 1;
  });
  out.sort(function (a, b) { return a.severity - b.severity; });
  let bad = 0;
  let warn = 0;
  out.forEach(function (c) {
    c.shade = c.tone === 'bad' ? 'b' + Math.min(bad++, 2) : 'w' + Math.min(warn++, 2);
  });
  return out;
}

// ---- sorting ---------------------------------------------------------------

export const SORTS = [
  { key: 'pts', label: 'Season points', hint: 'Most first' },
  { key: 'ppg', label: 'Points per game', hint: 'Most first' },
  { key: 'ret', label: 'Expected return', hint: 'Soonest first' },
  { key: 'sev', label: 'Severity', hint: 'IR first, Questionable last' },
  { key: 'chg', label: 'Latest change', hint: 'Newest first' },
  { key: 'name', label: 'Player', hint: 'A to Z' },
  { key: 'team', label: 'EDFL team', hint: 'A to Z' },
];

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

// Nulls last in every order, then by name, so two renders can never differ.
function desc(a, b, k) {
  const av = a[k];
  const bv = b[k];
  if (av === null && bv === null) return byName(a, b);
  if (av === null) return 1;
  if (bv === null) return -1;
  return bv !== av ? bv - av : byName(a, b);
}

export function compareInjuries(sortKey) {
  return function (a, b) {
    if (sortKey === 'ppg') return desc(a, b, 'fppg');
    if (sortKey === 'ret') {
      if (!a.retKey && !b.retKey) return desc(a, b, 'points');
      if (!a.retKey) return 1;
      if (!b.retKey) return -1;
      return a.retKey !== b.retKey ? (a.retKey < b.retKey ? -1 : 1) : desc(a, b, 'points');
    }
    if (sortKey === 'sev') return a.severity !== b.severity ? a.severity - b.severity : desc(a, b, 'points');
    if (sortKey === 'chg') {
      if (a.changedAt !== b.changedAt) return a.changedAt < b.changedAt ? 1 : -1;
      return byName(a, b);
    }
    if (sortKey === 'name') return byName(a, b);
    if (sortKey === 'team') {
      const c = (a.team || '~').localeCompare(b.team || '~');
      return c !== 0 ? c : desc(a, b, 'points');
    }
    return desc(a, b, 'points');
  };
}

export function ordinal(n) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return n + 'th';
  const last = n % 10;
  if (last === 1) return n + 'st';
  if (last === 2) return n + 'nd';
  if (last === 3) return n + 'rd';
  return n + 'th';
}

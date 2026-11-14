// NEEDS TILES -- UI test batch 14, November 14, 2026.
//
// One team's starters by lineup slot, as Lewis drew them on the GM's Office
// canvas (boards TrF-390, TrF-1280, TrG-390): six tiles (QB, RB, WR, TE, FLEX,
// K) with a dot per lineup spot (filled = a starter this week, open red =
// missing, grey = a spare after FLEX), "n/need", "short" when the team is short
// this week, and a small red note for the first LATER week that comes up
// shorter because of byes ("Wk 11: 0"), or "bye" when this week's shortage is a
// bye. Lewis, Nov 11-13: tiles, not a table; count FLEX; project against byes.
//
// IT DECIDES NOTHING. Every count is a column of edfl_team_needs() (test
// database, needs_01), which carries Lewis's need definition of November 13,
// 2026 -- the lineup, the starter cut-offs, "healthy", the byes through Week 14,
// short and spare. This file only draws those rows and words them. Never count
// starters here: a second copy of the definition would drift from the first.
//
// No hooks, no 'use client': it renders in a server page or a client component.

export const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K'];

/** The rows of one team, keyed slot -> rows ordered by week. */
export function rowsBySlot(rows, teamId) {
  const out = {};
  (rows || []).forEach(function (r) {
    if (r.team_id !== teamId) return;
    if (!out[r.slot]) out[r.slot] = [];
    out[r.slot].push(r);
  });
  Object.keys(out).forEach(function (k) {
    out[k].sort(function (a, b) { return a.week_number - b.week_number; });
  });
  return out;
}

/** The current week's number, from the rows. */
export function currentWeek(rows) {
  const r = (rows || []).find(function (x) { return x.is_current; });
  return r ? r.week_number : null;
}

export function lastWeek(rows) {
  let w = null;
  (rows || []).forEach(function (r) { if (w === null || r.week_number > w) w = r.week_number; });
  return w;
}

function surname(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : '';
}

function possessive(n) {
  return /s$/i.test(n) ? n + '’' : n + '’s';
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function weekWords(weeks) {
  if (weeks.length === 1) return 'Week ' + weeks[0];
  const run = weeks.every(function (w, i) { return i === 0 || w === weeks[i - 1] + 1; });
  if (run && weeks.length > 2) return 'Weeks ' + weeks[0] + ' to ' + weeks[weeks.length - 1];
  return 'Weeks ' + list(weeks.map(String));
}

/** Slots a team is short at this week. */
export function shortNow(rows, teamId) {
  const by = rowsBySlot(rows, teamId);
  return SLOT_ORDER.filter(function (s) {
    const now = (by[s] || []).find(function (r) { return r.is_current; });
    return now && now.short_by > 0;
  });
}

/** Positions a team has a spare at this week. */
export function spareNow(rows, teamId) {
  const by = rowsBySlot(rows, teamId);
  return SLOT_ORDER.filter(function (s) {
    const now = (by[s] || []).find(function (r) { return r.is_current; });
    return now && now.spare > 0;
  });
}

/**
 * "Short at RB and FLEX every week; QB in Week 11 (Maye's bye); K this week
 * (Santos's bye)." Built from the rows; null when the team is short nowhere.
 */
export function shortSentence(rows, teamId) {
  const by = rowsBySlot(rows, teamId);
  const every = [];
  const parts = [];
  SLOT_ORDER.forEach(function (s) {
    const rs = by[s] || [];
    if (rs.length === 0) return;
    const short = rs.filter(function (r) { return r.short_by > 0; });
    if (short.length === 0) return;
    if (short.length === rs.length) {
      every.push(s);
      return;
    }
    const weeks = short.map(function (r) { return r.week_number; });
    const byeNames = [];
    short.forEach(function (r) {
      (r.bye_names || []).forEach(function (n) {
        const sn = surname(n);
        if (byeNames.indexOf(sn) === -1) byeNames.push(sn);
      });
    });
    const when = short.length === 1 && short[0].is_current ? 'this week' : 'in ' + weekWords(weeks);
    parts.push(
      s + ' ' + when +
        (byeNames.length ? ' (' + list(byeNames.map(possessive)) + ' bye' + (byeNames.length > 1 ? 's' : '') + ')' : '')
    );
  });
  const out = [];
  if (every.length) out.push(list(every) + ' every week');
  return out.concat(parts).length ? 'Short at ' + out.concat(parts).join('; ') + '.' : null;
}

/** The six tiles for one team, from that team's rows. */
export default function NeedsTiles({ rows, teamId, label }) {
  const by = rowsBySlot(rows, teamId);
  const tiles = SLOT_ORDER.map(function (s) {
    const rs = by[s] || [];
    const now = rs.find(function (r) { return r.is_current; }) || null;
    if (!now) return { slot: s, missing: true };
    // The first later week that comes up shorter than this week.
    const later = rs.find(function (r) { return !r.is_current && r.short_by > now.short_by; }) || null;
    const byeNow = now.short_by > 0 && (now.bye_names || []).length > 0;
    return {
      slot: s,
      need: now.need,
      starters: now.starters,
      spare: now.spare,
      short: now.short_by > 0,
      note: byeNow ? 'bye' : later ? 'Wk ' + later.week_number + ': ' + later.starters : '',
    };
  });

  return (
    <div className="tdk-needs" role="img" aria-label={label || 'Starters by position this week, with later bye-week shortfalls'}>
      {tiles.map(function (t) {
        if (t.missing) {
          return (
            <div className="tdk-nd" key={t.slot}>
              <b>{t.slot}</b>
              <span className="tdk-nd-n">&mdash;</span>
            </div>
          );
        }
        const dots = [];
        for (let i = 0; i < t.need; i += 1) dots.push(i < t.starters ? 'f' : 'e');
        for (let j = 0; j < t.spare; j += 1) dots.push('x');
        return (
          <div className={'tdk-nd' + (t.short ? ' is-short' : '') + (t.spare > 0 ? ' is-deep' : '')} key={t.slot}>
            <b>{t.slot}</b>
            <span className="tdk-dots" aria-hidden="true">
              {dots.map(function (d, i) { return <i key={i} className={'is-' + d} />; })}
            </span>
            <span className="tdk-nd-n">{t.starters}/{t.need}</span>
            {t.short ? <em>short</em> : t.spare > 0 ? <em>+{t.spare} spare</em> : null}
            <small>{t.note}</small>
          </div>
        );
      })}
    </div>
  );
}

/** The key under the tiles. */
export function NeedsKey() {
  return (
    <div className="tdk-key">
      <span><i className="is-f" />Starter this week</span>
      <span><i className="is-e" />Missing</span>
      <span><i className="is-x" />Spare after FLEX</span>
      <span><b>Wk 11: 0</b> a later week that comes up short (byes)</span>
    </div>
  );
}

/**
 * Teams with spares where this team is short, best first. Short at FLEX counts
 * as short at RB, WR and TE. Each entry: team id, the position, the most spares
 * in any week, the weeks with a spare, and the slots that team is short at now.
 */
export function teamsThatFit(rows, myTeamId) {
  const myShort = {};
  (rows || []).forEach(function (r) {
    if (r.team_id === myTeamId && r.short_by > 0) {
      if (r.slot === 'FLEX') { myShort.RB = true; myShort.WR = true; myShort.TE = true; }
      else myShort[r.slot] = true;
    }
  });
  const wanted = Object.keys(myShort);
  const fits = {};
  (rows || []).forEach(function (r) {
    if (r.team_id === myTeamId || r.spare <= 0 || wanted.indexOf(r.slot) === -1) return;
    const k = r.team_id + '|' + r.slot;
    if (!fits[k]) fits[k] = { teamId: r.team_id, position: r.slot, most: 0, weeks: [] };
    fits[k].most = Math.max(fits[k].most, r.spare);
    fits[k].weeks.push(r.week_number);
  });
  const total = lastWeek(rows) !== null ? lastWeek(rows) - currentWeek(rows) + 1 : 0;
  return Object.keys(fits)
    .map(function (k) {
      const f = fits[k];
      f.weeks.sort(function (a, b) { return a - b; });
      f.when = f.weeks.length === total ? 'every week'
        : f.weeks.length * 2 > total ? 'most weeks'
          : 'in ' + weekWords(f.weeks);
      f.theirShort = shortNow(rows, f.teamId);
      return f;
    })
    .sort(function (a, b) { return b.weeks.length - a.weeks.length || b.most - a.most; });
}

/**
 * THE LEAGUE CALENDAR'S DATA SHAPING -- November 11, 2026 (UI test batch 9).
 *
 * Pure functions over the rows page.js loaded from the league_calendar view
 * (each row already carries startMs, endMs, started and running, computed on
 * the server against one clock reading). Nothing here reads the clock,
 * formats a date or decides a rule: every label shown is the view's own
 * pre-rendered Eastern string, and every date comes from a row.
 *
 * The season strip keys on rule_ref (Starter Memory 3.12: every consumer of
 * league_calendar_events keys on rule_ref, so a date change is a data update,
 * never a code change). What is written here is which RULES draw which lane,
 * never which DATES.
 */

// Display labels only. The database CHECK constraint on
// league_calendar_events.category is the source of truth for which categories
// exist; an unrecognised one falls through to its raw value rather than being
// dropped -- same principle as tierRows.
export const CATEGORY_LABELS = {
  season: 'Season',
  money: 'Cap & Cash',
  contracts: 'Contracts',
  cuts: 'Cuts',
  trades: 'Trades',
  draft: 'Draft',
  roster: 'Roster',
  gameplay: 'Gameplay',
  governance: 'Governance',
};

export function labelFor(category) {
  return CATEGORY_LABELS[category] || category;
}

// Every category the page knows, plus any unknown one the rows carry, sorted
// by its label. Used by the colour key and the Timeline's filter.
export function categoriesFor(entries) {
  const seen = Object.keys(CATEGORY_LABELS);
  for (const e of entries) {
    if (e.category && !seen.includes(e.category)) seen.push(e.category);
  }
  return seen.sort(function (a, b) {
    return labelFor(a).localeCompare(labelFor(b));
  });
}

// A category's colour class. An unknown category gets no colour class and
// draws in quiet ink (.lc-cd's default) rather than borrowing another's.
export function catClass(category) {
  return CATEGORY_LABELS[category] ? 'lc-k-' + category : '';
}

/**
 * Is this row a deadline? There is no column for it, so the title decides:
 * a row that "closes", is a "deadline" or is "due". The marker is a label
 * only (a brass "Deadline" word and a brass day number); nothing is enforced
 * by it. If the commissioner retitles rows (F23), re-check this list.
 */
const DEADLINE_WORDS = /\b(deadline|closes|due)\b/i;
export function isDeadline(e) {
  return DEADLINE_WORDS.test(e.title || '');
}

/**
 * Where "Read Rule ... in the Rule Book" lands. The League Library gives
 * every numbered Rule Book heading the anchor #s-<number with dashes>
 * (library.md: the scheme is stable and must not change), and its headings
 * are sections (5.18), not clauses (5.18(c)(ii)). So the link goes to the
 * section that contains the clause. A rule_ref that does not start with a
 * section number opens the Rule Book at its top.
 */
export function ruleHref(ref) {
  const m = /^(\d+)\.(\d+)/.exec(ref || '');
  return '/library/rule-book' + (m ? '#s-' + m[1] + '-' + m[2] : '');
}

// The rule_ref of a row is matched against a lane's prefixes: an exact match,
// or the prefix followed by a clause in brackets ("5.19" matches "5.19(a)").
function refMatches(ref, prefix) {
  if (!ref) return false;
  if (ref === prefix) return true;
  if (!ref.startsWith(prefix)) return false;
  return ref.charAt(prefix.length) === '(';
}

function matchesAny(ref, prefixes) {
  return prefixes.some(function (p) {
    return refMatches(ref, p);
  });
}

/**
 * THE STRIP'S LANES (Lewis, November 11, 8:58 AM: the window rows line up
 * with the phase bar, titles centred above, no opening rings, an explain icon
 * per row that explains the window and links to its rule).
 *
 *   rules    the rule_ref prefixes whose rows draw this lane
 *   closers  rule_refs that only ever CLOSE the lane's open bar (the trade
 *            deadline closes trade window 2, which has no closing row of its
 *            own)
 *
 * How bars are drawn from the rows, in the view's own order:
 *   - a row with its own end (ends_at) is a bar by itself (Poaching);
 *   - otherwise the first row of a rule opens a bar, and the next row of the
 *     SAME rule closes it ("Contract restructure window opens" / "closes");
 *     a closer row closes whatever bar is open; a row of a different rule
 *     closes the open bar where it starts and opens its own;
 *   - a bar still open after the last row runs to the end of the league year
 *     ("then again during the Dead Season", which ends with the year).
 * A closing row with no exact time closes at the END of its day ("Trade
 * window 3 closes" on Feb 21 means trades are allowed that day); one with an
 * exact time closes at that instant.
 */
export const LANES = [
  {
    key: 'trades',
    title: 'Trades',
    label: 'About the trade windows',
    rules: ['7.4(b)', '7.5(a)'],
    closers: ['7.5(a)'],
  },
  {
    key: 'restructures',
    title: 'Restructures',
    label: 'About the restructure window',
    rules: ['5.19'],
    closers: [],
  },
  {
    key: 'extensions',
    title: 'Extensions',
    label: 'About the extension window',
    rules: ['5.11'],
    closers: [],
  },
  {
    key: 'poaching',
    title: 'Poaching',
    label: 'About poaching',
    rules: ['5.17'],
    closers: [],
  },
  {
    key: 'june1',
    title: 'June 1 split',
    label: 'About the June 1st split',
    rules: ['5.18(c)'],
    closers: [],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function closeMs(e) {
  return e.time_is_exact ? e.startMs : e.startMs + DAY_MS;
}

/**
 * The league year's extent on the strip: from the earliest row's start to
 * the latest end any row carries (a ranged row's own end, or the end of the
 * last dated day). Returns null when it cannot be measured.
 */
export function yearSpan(entries) {
  let start = null;
  let end = null;
  for (const e of entries) {
    if (!Number.isFinite(e.startMs)) continue;
    if (start === null || e.startMs < start) start = e.startMs;
    const last = e.endMs !== null && Number.isFinite(e.endMs) ? e.endMs : closeMs(e);
    if (end === null || last > end) end = last;
  }
  if (start === null || end === null || end <= start) return null;
  return { start: start, end: end };
}

export function pct(ms, span) {
  const p = ((ms - span.start) / (span.end - span.start)) * 100;
  return Math.max(0, Math.min(100, p));
}

/**
 * The phase bar. Each phase starts at its own row and runs to the next
 * phase's start; the last runs to the end of the year. A phase whose row is
 * missing is not drawn (the others still are).
 *   Off-season   the "Off-season begins" row, rule 1.4(b)
 *   In-Season    the "In-Season begins" row, rule 1.4(c)
 *   Playoffs     the first playoff round, rule 9.2(b)
 *   Dead Season  the Dead Season's ranged row, rule 1.4(d)
 */
const PHASES = [
  { key: 'off', label: 'Off-season', find: (e) => e.rule_ref === '1.4(b)' },
  { key: 'ins', label: 'In-Season', find: (e) => e.rule_ref === '1.4(c)' },
  { key: 'po', label: 'Playoffs', find: (e) => refMatches(e.rule_ref, '9.2(b)') },
  { key: 'dead', label: 'Dead Season', find: (e) => e.rule_ref === '1.4(d)' && e.endMs !== null },
];

export function phasesFor(entries, span) {
  const found = [];
  for (const p of PHASES) {
    const row = entries.find(p.find);
    if (row) found.push({ key: p.key, label: p.label, start: row.startMs });
  }
  found.sort(function (a, b) {
    return a.start - b.start;
  });
  return found.map(function (p, i) {
    const end = i + 1 < found.length ? found[i + 1].start : span.end;
    return { key: p.key, label: p.label, left: pct(p.start, span), width: pct(end, span) - pct(p.start, span) };
  });
}

export function lanesFor(entries, span) {
  return LANES.map(function (lane) {
    const rows = entries.filter(function (e) {
      return matchesAny(e.rule_ref, lane.rules);
    });
    const bars = [];
    const openers = [];
    let open = null;
    function shut(atMs) {
      if (open) bars.push({ start: open.start, end: atMs, category: open.category });
      open = null;
    }
    for (const e of rows) {
      if (e.endMs !== null) {
        bars.push({ start: e.startMs, end: e.endMs, category: e.category });
        openers.push(e);
        continue;
      }
      const isCloser = matchesAny(e.rule_ref, lane.closers);
      if (isCloser || (open && open.ref === e.rule_ref)) {
        shut(closeMs(e));
        continue;
      }
      shut(e.startMs);
      open = { ref: e.rule_ref, start: e.startMs, category: e.category };
      openers.push(e);
    }
    shut(span.end);
    return {
      key: lane.key,
      title: lane.title,
      label: lane.label,
      bars: bars.map(function (b) {
        return {
          left: pct(b.start, span),
          width: Math.max(0.5, pct(b.end, span) - pct(b.start, span)),
          category: b.category,
        };
      }),
      openers: openers,
      rules: ruleGroups(rows),
    };
  });
}

/**
 * The rules a lane's card links to: one entry per Rule Book section, named
 * by the longest clause its rows share ("5.18(c)(i)" and "5.18(c)(ii)" read
 * "5.18(c)"; "7.4(b)(i)"... and "7.5(a)" read "7.4(b)" and "7.5(a)").
 */
function ruleGroups(rows) {
  const bySection = [];
  for (const e of rows) {
    const m = /^\d+\.\d+/.exec(e.rule_ref || '');
    if (!m) continue;
    let g = bySection.find((x) => x.section === m[0]);
    if (!g) {
      g = { section: m[0], refs: [] };
      bySection.push(g);
    }
    if (!g.refs.includes(e.rule_ref)) g.refs.push(e.rule_ref);
  }
  return bySection.map(function (g) {
    let common = g.refs[0];
    for (const r of g.refs) {
      let i = 0;
      while (i < common.length && i < r.length && common[i] === r[i]) i++;
      common = common.slice(0, i);
    }
    // Trim back to a whole clause: "5.18(c)(i" -> "5.18(c)".
    const close = common.lastIndexOf(')');
    const open = common.lastIndexOf('(');
    if (open > close) common = common.slice(0, open);
    return { ref: common || g.section, href: ruleHref(g.section) };
  });
}

export function joinRules(rules) {
  const names = rules.map((r) => r.ref);
  if (names.length <= 1) return 'Rule ' + (names[0] || '');
  return 'Rules ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/**
 * The current game week, for "Right now": the last week row that has
 * started, while the next week row has not (or, after the last week, until
 * the regular season's end row, rule 9.1(b), has passed). Null otherwise.
 */
export function currentWeek(entries) {
  const weeks = entries.filter((e) => e.source === 'week');
  let current = null;
  let next = null;
  for (const w of weeks) {
    if (w.started) current = w;
    else if (!next) next = w;
  }
  if (!current) return null;
  if (next) return current;
  const end = entries.find((e) => e.rule_ref === '9.1(b)');
  if (end && !end.is_past) return current;
  return null;
}

// The first row that has not started yet. A running window is "open now",
// never "next up" (F16).
export function nextUp(entries) {
  return entries.find((e) => !e.started) || null;
}

// Whole days from today's Eastern date to a row's Eastern date, both
// 'YYYY-MM-DD' strings, counted in UTC so no zone can shift them.
export function daysBetween(fromKey, toKey) {
  const a = Date.UTC(+fromKey.slice(0, 4), +fromKey.slice(5, 7) - 1, +fromKey.slice(8, 10));
  const b = Date.UTC(+toKey.slice(0, 4), +toKey.slice(5, 7) - 1, +toKey.slice(8, 10));
  return Math.round((b - a) / DAY_MS);
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthShort(monthKey) {
  return MONTH_NAMES[+monthKey.slice(5, 7) - 1].slice(0, 3);
}

export function monthLong(monthKey) {
  return MONTH_NAMES[+monthKey.slice(5, 7) - 1] + ' ' + monthKey.slice(0, 4);
}

// Every month key from the first row's month to the last date any row
// reaches, in order, including months with no rows (April has none).
export function monthsOfYear(entries) {
  let first = null;
  let last = null;
  for (const e of entries) {
    const a = e.local_date;
    const b = e.end_local_date || e.local_date;
    if (!a) continue;
    if (first === null || a < first) first = a;
    if (last === null || b > last) last = b;
  }
  if (!first) return [];
  const out = [];
  let y = +first.slice(0, 4);
  let m = +first.slice(5, 7);
  const endKey = last.slice(0, 7);
  for (let guard = 0; guard < 36; guard++) {
    const key = y + '-' + String(m).padStart(2, '0');
    out.push(key);
    if (key >= endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// The month grid's cells: leading blanks for the weekday the month starts on,
// then one cell per day, then trailing blanks to a whole week. Calendar
// arithmetic on the key only, in UTC, so no zone can move a day.
export function monthCells(monthKey) {
  const y = +monthKey.slice(0, 4);
  const m = +monthKey.slice(5, 7);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(monthKey + '-' + String(d).padStart(2, '0'));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// "Tue" from the view's day_label "Tue, Nov 17".
export function weekdayOf(e) {
  return (e.day_label || '').split(',')[0];
}

// The date tile's number and caption: "17" / "Tue", or a range "17–21" /
// "Dec", "31–4" / "Dec–Jan".
export function dayTile(e) {
  const d1 = String(+e.local_date.slice(8, 10));
  if (!e.end_local_date || e.end_local_date === e.local_date) {
    return { range: false, n: d1, cap: weekdayOf(e) };
  }
  const d2 = String(+e.end_local_date.slice(8, 10));
  const m1 = monthShort(e.local_date.slice(0, 7));
  const m2 = monthShort(e.end_local_date.slice(0, 7));
  return { range: true, n: d1 + '–' + d2, cap: m1 === m2 ? m1 : m1 + '–' + m2 };
}

// The full when-line: "Tue, Nov 17 · 12:00 AM ET", "Thu, Dec 17 – Mon, Dec 21".
export function whenLine(e) {
  let s = e.day_label;
  if (e.end_day_label) s += ' – ' + e.end_day_label;
  if (e.time_label) s += ' · ' + e.time_label;
  return s;
}

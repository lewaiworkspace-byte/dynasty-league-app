// Formatting for the Matchups tab (UI test batch 20, November 15, 2026).
//
// NOTHING HERE DECIDES OR ADDS ANYTHING. Every total, difference, count and
// flag on the tab comes from edfl_matchups_week_sides / _players (test
// database, matchups_01-02); these helpers only turn those values into text.
// No Date.now(): a server render and the browser must print the same thing.

const ET = 'America/New_York';
const MINUS = '−';
const DASH = '—';

export function pts(n) {
  if (n === null || n === undefined || n === '') return DASH;
  const v = Number(n);
  if (!Number.isFinite(v)) return DASH;
  return v.toFixed(2);
}

// A difference against the projection: "+17.26", "−0.70", "0.00".
export function signed(n) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v).toFixed(2);
  if (a === '0.00') return '0.00';
  return (v > 0 ? '+' : MINUS) + a;
}

// up / dn / '' for the green and red of a difference.
export function tone(n) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return '';
  if (Math.abs(v) < 0.005) return '';
  return v > 0 ? 'up' : 'dn';
}

// "Drake Maye" -> "D. Maye"; "T.J. Hockenson" -> "T. Hockenson".
export function shortName(full) {
  const s = String(full || '').trim();
  const i = s.indexOf(' ');
  if (i < 0) return s;
  return s.charAt(0) + '. ' + s.slice(i + 1);
}

export function record(side) {
  if (!side) return '';
  const t = Number(side.ties) > 0 ? '–' + side.ties : '';
  return side.wins + '–' + side.losses + t;
}

// "Sun 1:00", "Sun 9:30a", "Thu 8:15" (Eastern). The board's own short form.
export function kickoffShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { timeZone: ET, weekday: 'short' });
  const parts = d.toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' });
  const m = parts.match(/^(\d+):(\d+)\s*([AP])M$/i);
  if (!m) return day + ' ' + parts;
  return day + ' ' + m[1] + ':' + m[2] + (m[3].toUpperCase() === 'A' ? 'a' : '');
}

function monthDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return {
    m: d.toLocaleDateString('en-US', { timeZone: ET, month: 'short' }),
    d: d.toLocaleDateString('en-US', { timeZone: ET, day: 'numeric' }),
  };
}

// "Nov 12–16", or "Nov 26–Dec 1" across a month end.
export function weekRange(w) {
  if (!w || !w.first_game_at) return '';
  const a = monthDay(w.first_game_at);
  const b = w.last_game_at ? monthDay(w.last_game_at) : null;
  if (!a) return '';
  if (!b) return a.m + ' ' + a.d;
  if (a.m === b.m) return a.m + ' ' + a.d + '–' + b.d;
  return a.m + ' ' + a.d + '–' + b.m + ' ' + b.d;
}

export const STATE_WORDS = {
  final: 'Final',
  live: 'In progress',
  projected: 'Not started · projected',
};

// Bar width, as a percentage of the largest value drawn, never negative.
export function pct(v, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !(max > 0)) return 0;
  return Math.min(100, (n / max) * 100);
}

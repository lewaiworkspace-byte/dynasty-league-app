// Every timestamp this app displays is formatted in Eastern, explicitly,
// in both server and client contexts.
//
// The bug this exists to prevent: Date.prototype.toLocaleString() with no
// timeZone option formats in whatever zone the code happens to be running
// in. Server Components run on Vercel (UTC) and printed 2:58 AM Aug 5;
// client components run in the owner's browser and printed 10:58 PM Aug 4
// for an Eastern owner. The same instant rendered four hours apart
// depending on which page showed it, and an owner reading a server-rendered
// close time believed they had four more hours than they did. Owners are
// also spread across zones, so browser-local rendering meant two owners
// saw different close times for the same tier.
//
// The IANA zone name is used deliberately, NOT a fixed offset. It handles
// the EDT/EST transition on its own; a hardcoded -4 or -5 would be right
// today and silently wrong from the first Sunday in November, mid-season.
export const EASTERN_TIME_ZONE = 'America/New_York';

const EM_DASH = '—';

// A DATE column ('2026-08-03') carries no time and no zone. new Date()
// parses it as UTC midnight, so formatting it in Eastern would render the
// PREVIOUS day (UTC midnight is 8 PM the day before in New York). Those
// values are calendar dates, not instants, so they're formatted in UTC --
// which is where Date put them -- and come out exactly as stored.
//
// Anything with a time component is a real instant and does get converted
// to Eastern.
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isMissing(ts) {
  return ts === null || ts === undefined || ts === '';
}

function isBareDate(ts) {
  return typeof ts === 'string' && BARE_DATE.test(ts.trim());
}

/**
 * Full date and time in Eastern, e.g. "Aug 4, 2026, 10:58 PM ET".
 * Use for anything showing a time: tier open/close windows, armed_at,
 * resolved_at, verified_at, submitted_at, action log entries.
 */
export function formatDateTime(ts) {
  if (isMissing(ts)) return EM_DASH;
  const d = toDate(ts);
  if (!d) return EM_DASH;
  return (
    d.toLocaleString('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

/**
 * Compact date and time in Eastern, e.g. "Aug 4, 10:58 PM ET" -- no year.
 * Matches what app/bids/page.js's old formatWindow() produced, plus the
 * zone suffix it was missing.
 */
export function formatShortDateTime(ts) {
  if (isMissing(ts)) return EM_DASH;
  const d = toDate(ts);
  if (!d) return EM_DASH;
  return (
    d.toLocaleString('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

/**
 * Date only, e.g. "Aug 4, 2026". No time, and deliberately no ET suffix --
 * a bare calendar date isn't a clock reading and labelling it with a zone
 * would imply a precision it doesn't have.
 *
 * Handles both shapes correctly: a DATE column renders the stored calendar
 * date unshifted, while a timestamptz renders the date it fell on in
 * Eastern.
 */
export function formatDate(ts) {
  if (isMissing(ts)) return EM_DASH;
  const d = toDate(ts);
  if (!d) return EM_DASH;
  return d.toLocaleDateString('en-US', {
    timeZone: isBareDate(ts) ? 'UTC' : EASTERN_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The zone the current browser is set to. Returns null on the server,
 * where the answer would be Vercel's UTC rather than anything about the
 * person using the app -- callers should treat null as "don't know yet"
 * and check again after mount.
 */
export function browserTimeZone() {
  if (typeof window === 'undefined') return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (err) {
    return null;
  }
}

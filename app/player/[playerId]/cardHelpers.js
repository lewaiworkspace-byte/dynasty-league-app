// Shared vocabulary for the Player Card. Labels and display shaping only --
// no money is computed here beyond summing values the database already
// computed, which is the same concession /team/[teamId] makes for its
// liability rows. Anything resembling settlement arithmetic belongs in a
// database view, not in this file.

export const CONTRACT_TYPE_LABELS = {
  rookie: 'Rookie',
  fifth_year_option: '5th Year Option',
  veteran_free_agent: 'Veteran Free Agent',
  practice_squad: 'Practice Squad',
  franchise_tag_exclusive: 'Franchise Tag (Exclusive)',
  franchise_tag_non_exclusive: 'Franchise Tag (Non-Exclusive)',
  transition_tag: 'Transition Tag',
};

export const CONTRACT_STATUS_LABELS = {
  active: 'Active',
  cut: 'Cut',
  cut_june1: 'Cut (June 1)',
  traded_away: 'Traded away',
  expired: 'Expired',
  retired: 'Retired',
  extended: 'Extended',
};

export function contractTypeLabel(type) {
  return CONTRACT_TYPE_LABELS[type] || type || '—';
}

export function contractStatusLabel(status) {
  return CONTRACT_STATUS_LABELS[status] || status || '—';
}

// Feed kinds -> the status-chip tone already defined in globals.css.
// good = money/roster arriving, bad = leaving, live = attention.
const FEED_TONES = {
  signed_auction: 'status-good',
  signed_rookie: 'status-good',
  signed: 'status-good',
  extended: 'status-good',
  traded: 'status-live',
  released: 'status-bad',
  released_june1: 'status-bad',
  cut_reversed: 'status-good',
  roster_taxi: 'status-off',
  roster_ir: 'status-off',
  roster_active: 'status-off',
  bid_lost: 'status-off',
  bid_withdrawn: 'status-off',
  bid_passed_over: 'status-bad',
  contract_deleted: 'status-off',
  // A restructure moves money between seasons rather than in or out, so it
  // reads as attention rather than good or bad. Both spellings are carried
  // because the feed's kind is derived from contract_events.event_type
  // ('restructure') and the view may surface it either way; an unmapped kind
  // falls through to status-off, which is a quiet miss rather than a break.
  restructure: 'status-live',
  restructured: 'status-live',
  restructure_reversed: 'status-good',
};

export function feedTone(kind) {
  return FEED_TONES[kind] || 'status-off';
}

/** Coerce a database numeric (string) to a number, null-safe. */
export function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

/** Sum database values, treating null as 0. Display-time only. */
export function sumVals(list) {
  let total = 0;
  for (let i = 0; i < list.length; i += 1) {
    const v = n(list[i]);
    if (v !== null) total += v;
  }
  return total;
}

/**
 * The last surname token, for prose ("In 2026, Metcalf carries..."). Falls
 * back to the full name when splitting makes no sense.
 */
export function lastName(fullName) {
  if (!fullName) return 'this player';
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const last = parts[parts.length - 1];
  // "Odell Beckham Jr." should read "Beckham", not "Jr."
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(last) && parts.length >= 3) {
    return parts[parts.length - 2];
  }
  return last;
}

/** "3 yr(s) / $353" style span for a contract history row. */
export function contractSpan(row) {
  const start = row.start_year;
  const total = Number(row.total_years) || 1;
  if (!start) return '—';
  if (total <= 1) return String(start);
  return start + '–' + (start + total - 1);
}

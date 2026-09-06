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
  // A contract reaching its natural end is not a release: nothing was taken
  // away and nobody decided anything, so it is quiet rather than bad. Until
  // fyo_07 this event_type fell into the feed's ELSE and rendered as
  // "Released", which was wrong on both the word and the tone. NOT COSMETIC AT
  // THE MARCH 2027 ROLLOVER, when 62 contracts expire at once.
  expired: 'status-off',
  cut_reversed: 'status-good',
  roster_taxi: 'status-off',
  roster_ir: 'status-off',
  roster_active: 'status-off',
  bid_lost: 'status-off',
  bid_withdrawn: 'status-off',
  bid_passed_over: 'status-bad',
  contract_deleted: 'status-off',
  // A restructure moves money between seasons rather than in or out, so it
  // reads as attention rather than good or bad.
  //
  // 'restructure' WAS CARRIED HERE TOO and has been removed: the feed's
  // complete kind vocabulary was published on September 6 and the view emits
  // 'restructured' only, so the bare spelling matched nothing. Same defect
  // class as the speculative option spellings below -- see the note there.
  restructured: 'status-live',
  restructure_reversed: 'status-good',
  // FIFTH YEAR OPTION (rule 5.9, September 2026). These four kinds are emitted
  // by player_transaction_feed as of migration fyo_07, which added explicit
  // branches for them. Before it, the view's contract_events branch was a
  // whitelist with an ELSE, and both option events fell through it and rendered
  // as "Released" -- a live defect, fixed database-side.
  //
  // THE SPELLINGS HERE ARE THE VIEW'S, VERIFIED AGAINST IT. An earlier version
  // of this map also carried speculative 'option_exercised' / 'option_declined'
  // fallbacks; the view never emitted either, so they matched nothing and only
  // made the map look more defensive than it was. Do not add a spelling that
  // has not been confirmed against the view.
  //
  // Exercised adds a guaranteed season, so it reads as arriving. Declined ends
  // the deal after the current season -- the player is leaving, the same
  // direction as a release.
  //
  // 'fifth_year_option_contract' was mapped here and is GONE. It existed only
  // under the two-contract design, where exercising wrote a second contract
  // that needed its own signing row. fyo_13 made the option EXTEND the rookie
  // contract instead -- total_years 1 -> 2, one added season row -- so no
  // second contract is created and that kind can no longer occur.
  fifth_year_option_exercised: 'status-good',
  fifth_year_option_declined: 'status-bad',
  // A reversal can undo an exercise OR a decline, so its direction is not fixed
  // and neither good nor bad is honest. It is a correction, which is what
  // status-live means here. This deliberately differs from cut_reversed and
  // restructure_reversed above, both of which undo one thing in one direction.
  fifth_year_option_reversed: 'status-live',
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

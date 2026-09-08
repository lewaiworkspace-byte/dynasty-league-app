// PLAYER SEARCH -- the two numbers and the one label ruling, in one place.
//
// Three files need these: app/search/page.js (which runs the first search on
// the server, so /search?q=kittle renders results without a client round
// trip), app/search/actions.js (the p_limit it sends), and
// app/search/SearchPanel.js (the "showing the first 50" notice). RESULT_CAP
// has to be the same number in all three or the notice lies about a list that
// was silently truncated, which is the failure this project keeps hitting --
// so it gets one home rather than three copies, the same reason
// lib/injuryReport.js and lib/formatMoney.js exist.
//
// NEITHER CONSTANT IS THE RULE. search_players() clamps to 50 rows whatever
// p_limit says, and measures its own two-character minimum on the NORMALISED
// query -- so ".." is under the minimum there and two characters here. These
// are the client's copy of numbers it has to print and a threshold for not
// firing a request nobody wants; the database decides, as always. If the
// database cap moves, this moves with it.

import { rosterSlotLabel } from './injuryReport';

export const MIN_QUERY_LENGTH = 2;
export const RESULT_CAP = 50;

/**
 * THE COMMISSIONER'S LABEL RULING OF SEPTEMBER 8, 2026, and the only place it
 * is written down. A result for a player with no active contract reads
 * "Free agent", always -- and "Last: <team>" as well, but only when the
 * function supplied one.
 *
 * THERE IS NO THIRD STATE AND ONE MUST NOT BE INVENTED. In particular there is
 * no waiver-pending label: under the waiver rulings of September 7 (R3, W-10) a
 * waived player's contract stays active until the run, so he comes back with
 * his team on him and never reaches the free agent branch at all. The two
 * cannot collide.
 *
 * has_edfl_history is deliberately NOT read here. The function already
 * guarantees last_edfl_team is non-null only when there is history and no
 * active contract, so the flag would be a second way of asking the same
 * question -- and a second way to get a different answer.
 *
 * @param {object} row one row of search_players()
 * @returns {{isFreeAgent: boolean, primary: string, secondary: string|null}}
 */
export function edflStanding(row) {
  if (!row || row.is_free_agent) {
    const last = row && row.last_edfl_team;
    return {
      isFreeAgent: true,
      primary: 'Free agent',
      secondary: last ? 'Last: ' + last : null,
    };
  }

  // rosterSlotLabel comes from lib/injuryReport.js because that is where the
  // app's ONE active/taxi/ir map already lives -- "taxi" must never reach an
  // owner's screen as "taxi", and a second copy of the map here is how the two
  // would drift. It falls through to the raw value for an unmapped slot, which
  // is the tierRows principle: a new roster status shows up as itself rather
  // than vanishing.
  const slot = rosterSlotLabel(row.roster_status);
  return {
    isFreeAgent: false,
    primary: row.edfl_team || 'Unknown team',
    secondary: slot || null,
  };
}

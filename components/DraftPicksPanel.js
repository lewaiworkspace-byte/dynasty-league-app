'use client';

import PlayerLink from './PlayerLink';
import { formatShortDateTime } from '../lib/formatDate';

/**
 * The Draft Picks tab on a team page. Reference only -- nothing here writes.
 *
 * THESE ARE `.ledger` TABLES, NOT `.grid-table`, AND THE FIRST VERSION GOT THIS
 * WRONG. CLAUDE.md says it twice: `.grid-table` is for NUMBERS, `.ledger` is for
 * ROWS A HUMAN READS. `.grid-table tbody td` is monospace, `tabular-nums`,
 * right-aligned and `white-space: nowrap`, and `table.grid-table` carries
 * `min-width: 640px` -- so the History column, whose longest line measures 79
 * characters (a 59-character sentence plus a "Sep 8, 9:06 AM ET" stamp), becomes
 * one unbreakable run and the table's width becomes the sum of the longest ones.
 * That is the Sleeper Sync table's 332px of sideways scroll, for the third time.
 *
 * EVERY `<td>` CARRIES `data-label`. The 640px card flip is `content:
 * attr(data-label)` on `td::before` and styles `td` only -- without the
 * attribute the rows flip to unlabelled text, and a `<th scope="row">` would not
 * flip at all.
 *
 * History lines are wrapped in ONE `<div>` on purpose. Below 640px `.ledger
 * tbody td` becomes `display: flex; justify-content: space-between`, so every
 * child of the cell is a flex item -- bare sibling divs would lay the history
 * lines out side by side instead of stacked.
 *
 * EVERY FIELD IS READ FROM draft_pick_board. Nothing is derived, sorted or
 * worded in JavaScript, for the same reason the Overview grid stopped summing
 * its own totals: a number or a sentence built here is a second answer that can
 * disagree with the league page showing the same pick.
 *
 * In particular `history` arrives already ordered and already worded by the
 * database, as {at, kind, description}. `description` is rendered verbatim.
 * `kind` is available for styling and is deliberately NOT used to compose a
 * sentence -- an unmapped kind would then render as a blank or a broken phrase,
 * silently, which is SR-36's trap.
 *
 * THREE TABLES, IN RENDER ORDER, BECAUSE THEY ANSWER THREE DIFFERENT QUESTIONS:
 *
 *   1. Picks held   -- drafts not yet held. What this team has to spend.
 *   2. Traded away  -- drafts not yet held, originally this team's, owned by
 *                      somebody else now. What it owes.
 *   3. Picks made   -- drafts already held. current_team_id is the team that was
 *                      on the clock, so this is "picks this team used".
 *
 * Tables 1 and 3 are the same filter split by `draft_completed`. Table 2 is not
 * the inverse of table 1 and must not be folded into it -- "what did I give up"
 * and "what do I have" are different questions and one table with a flag answers
 * neither cleanly.
 *
 * TABLE 2 IS FUTURE-ONLY, DELIBERATELY. A traded pick that has since been used
 * is settled history, not an outstanding obligation, and mixing the two would
 * make the list read as debt that is still owed. Nothing is lost by leaving it
 * out: a used pick appears on the acquiring team's Picks made, carrying the
 * "via <original owner>" note below. Today the data makes this filter a no-op --
 * no 2023-2026 slot changed hands before it was used -- which is exactly why it
 * is worth writing now rather than discovering the day one does.
 *
 * The "via" note draws on no row today for the same reason. It is here because a
 * 2027 pick acquired by trade and then used will need it, and finding that out
 * then is worse than carrying it now.
 */

function History({ items }) {
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    return <span className="row-note">&mdash;</span>;
  }

  return (
    <div>
      {list.map(function (h, i) {
        return (
          <div key={i} className="row-note">
            {formatShortDateTime(h.at)} &middot; {h.description}
          </div>
        );
      })}
    </div>
  );
}

function viaNote(row, teamId) {
  if (!row.original_team_id || row.original_team_id === teamId) return null;
  return <span className="row-note"> via {row.original_team_name}</span>;
}

export default function DraftPicksPanel({ teamId, rows, loadError }) {
  // A FAILED READ SAYS SO. An empty Draft Picks tab reads as "this team has no
  // picks", which is a plausible-looking wrong answer and, for a team that has
  // traded none away, indistinguishable from the truth.
  if (loadError) {
    return (
      <div className="form-error">
        Draft picks could not be loaded: {loadError}. This tab is not answering the question
        &mdash; do not read it as an empty pick sheet.
      </div>
    );
  }

  const all = rows || [];
  const held = all.filter(function (r) {
    return r.current_team_id === teamId;
  });
  const made = held.filter(function (r) {
    return r.draft_completed;
  });
  const upcoming = held.filter(function (r) {
    return !r.draft_completed;
  });
  const gone = all.filter(function (r) {
    return (
      r.original_team_id === teamId && r.current_team_id !== teamId && !r.draft_completed
    );
  });

  return (
    <div>
      <p className="row-note">
        Reference only. Picks are traded on the Trades page; nothing on this tab changes
        anything.
      </p>

      <h2 className="section-heading">Picks held</h2>
      {upcoming.length === 0 ? (
        <p className="empty-note">No picks in any draft that has not yet been held.</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Season</th>
                <th>Pick</th>
                <th>Acquired from</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map(function (r) {
                return (
                  <tr key={r.pick_id}>
                    <td data-label="Season">{r.season_year}</td>
                    <td data-label="Pick">{r.pick_label}</td>
                    <td data-label="Acquired from">
                      {r.original_team_id === teamId ? (
                        <span className="row-note">Own pick</span>
                      ) : (
                        <span className="team-name">{r.original_team_name}</span>
                      )}
                    </td>
                    <td data-label="History">
                      <History items={r.history} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {upcoming.length > 0 && (
        <p className="row-note">
          Holding {upcoming.length} pick{upcoming.length === 1 ? '' : 's'} across drafts still to
          come.
        </p>
      )}

      <h2 className="section-heading">Traded away</h2>
      {gone.length === 0 ? (
        <p className="empty-note">
          This team still owns every pick it started with in the drafts still to come.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Season</th>
                <th>Pick</th>
                <th>Now owned by</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {gone.map(function (r) {
                return (
                  <tr key={r.pick_id}>
                    <td data-label="Season">{r.season_year}</td>
                    <td data-label="Pick">{r.pick_label}</td>
                    <td data-label="Now owned by">
                      <span className="team-name">{r.current_team_name}</span>
                    </td>
                    <td data-label="History">
                      <History items={r.history} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-heading">Picks made</h2>
      {made.length === 0 ? (
        <p className="empty-note">No selections on record.</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Season</th>
                <th>Pick</th>
                <th>Player</th>
                <th>Owned now by</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {made.map(function (r) {
                return (
                  <tr key={r.pick_id}>
                    <td data-label="Season">{r.season_year}</td>
                    <td data-label="Pick">
                      {r.pick_label}
                      {viaNote(r, teamId)}
                    </td>
                    <td data-label="Player">
                      <PlayerLink playerId={r.player_id}>
                        {r.player_name || '—'}
                      </PlayerLink>
                      {r.player_position ? (
                        <span className="row-note"> {r.player_position}</span>
                      ) : null}
                    </td>
                    <td data-label="Owned now by">
                      {r.player_current_team_name ? (
                        <span className="team-name">{r.player_current_team_name}</span>
                      ) : (
                        <span className="row-note">{r.player_status || '—'}</span>
                      )}
                    </td>
                    <td data-label="History">
                      <History items={r.history} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

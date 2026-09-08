'use client';

import { useEffect, useRef, useState } from 'react';
import PlayerLink from '../../components/PlayerLink';
import { designationFor } from '../../lib/injuryReport';
import { MIN_QUERY_LENGTH, RESULT_CAP, edflStanding } from '../../lib/playerSearch';
import { searchPlayers } from './actions';

// THE SEARCH SURFACE. The app bar's box is deliberately dumb -- it navigates
// here and nothing more -- so this is the only place results are drawn and
// there is no second data path to keep in step.
//
// NOTHING HERE COMPUTES ANYTHING. Whether a player is a free agent, which team
// he was last on, which team holds him now and what his roster slot is are all
// columns on the row search_players() returned. This file picks a colour and
// prints what the database said.
//
// .ledger, NOT .grid-table. The EDFL column holds a phrase -- "Free agent,
// Last: Cash Over Cap" -- and .grid-table is the numeric primitive: monospace,
// tabular-nums, right-aligned, nowrap, with a 640px min-width on the table. It
// is the wrong question for this table, which holds no figures at all. Sleeper
// Sync learned that at 332px of sideways scroll and the Draft Picks tab was
// corrected for it in review. Every td carries data-label, because the card
// flip at 640px reads it from that attribute and styles td only.

const DEBOUNCE_MS = 250;

// Local, three lines, and a twin of the one in
// app/injury-report/InjuryReportTable.js. Kept rather than shared because it
// is a pure tone-to-class map with no decision in it; if either ever grows
// one, export it from lib/injuryReport.js and import it in both.
function toneClass(tone) {
  if (tone === 'bad') return 'status status-bad';
  if (tone === 'warn') return 'status status-live';
  return 'status status-good';
}

export default function SearchPanel(props) {
  const [query, setQuery] = useState(props.initialQuery || '');
  const [rows, setRows] = useState(props.initialRows || []);
  const [error, setError] = useState(props.initialError || null);
  const [busy, setBusy] = useState(false);

  // The query the rows on screen actually answer. Seeded with what the server
  // already searched for, so arriving at /search?q=kittle does not immediately
  // fire the same search a second time.
  const servedRef = useRef(props.initialQuery || '');

  // A sequence number, because a slow request for "kit" must never overwrite a
  // finished one for "kittle". Same lesson as the free agency board's offer
  // reducer, where a stale withdrawn offer overwrote the live one.
  const seqRef = useRef(0);

  // ONE REQUEST PER PAUSE, NOT ONE PER KEYSTROKE.
  useEffect(
    function () {
      const text = query.trim();

      if (text === servedRef.current) {
        setBusy(false);
        return;
      }

      // Under the minimum: show the prompt and send NOTHING. A request that
      // can only come back empty is a request not worth making.
      if (text.length < MIN_QUERY_LENGTH) {
        seqRef.current += 1;
        servedRef.current = text;
        setRows([]);
        setError(null);
        setBusy(false);
        return;
      }

      setBusy(true);
      seqRef.current += 1;
      const seq = seqRef.current;

      const timer = setTimeout(function () {
        searchPlayers(text).then(
          function (res) {
            if (seq !== seqRef.current) return;
            servedRef.current = text;
            if (res.ok) {
              setRows(res.data);
              setError(null);
            } else {
              setRows([]);
              setError(res.message);
            }
            setBusy(false);
          },
          function () {
            // A genuine transport failure. The action itself returns its
            // refusals rather than throwing them (ground rule 9), so anything
            // that lands here is the network, not the database.
            if (seq !== seqRef.current) return;
            servedRef.current = text;
            setRows([]);
            setError('The search did not respond. Check your connection and try again.');
            setBusy(false);
          }
        );
      }, DEBOUNCE_MS);

      return function () {
        clearTimeout(timer);
      };
    },
    [query]
  );

  // Keep the address bar in step with what is on screen, so the page stays
  // linkable and reloadable after typing. replaceState rather than a router
  // push: a push would re-run the server component and search everything
  // twice. Debounced and wrapped, because Safari throttles replaceState and
  // throws when it does -- and the URL is a convenience here, never the source
  // of the results.
  useEffect(
    function () {
      const timer = setTimeout(function () {
        try {
          const text = query.trim();
          const url = text ? '/search?q=' + encodeURIComponent(text) : '/search';
          window.history.replaceState(null, '', url);
        } catch (e) {
          // Nothing to do, and nothing an owner could act on.
        }
      }, DEBOUNCE_MS);
      return function () {
        clearTimeout(timer);
      };
    },
    [query]
  );

  const text = query.trim();
  const tooShort = text.length < MIN_QUERY_LENGTH;
  const capped = rows.length >= RESULT_CAP;

  return (
    <div>
      <div className="admin-form">
        <div className="form-row">
          <label style={{ flex: '1 1 280px' }}>
            Player name
            <input
              type="search"
              value={query}
              autoFocus
              placeholder="Type at least two letters"
              aria-label="Search players by name"
              onChange={function (e) {
                setQuery(e.target.value);
              }}
            />
          </label>
        </div>
      </div>

      {/* A FAILED READ SAYS SO. An empty table and a search that did not run
          are opposite claims, and the second must never wear the first one's
          clothes -- the yearRows lesson, applied before the fact. */}
      {error && <p className="form-error">Couldn&apos;t run the search: {error}</p>}

      {!error && tooShort && (
        <p className="empty-note">Type at least two letters to search for a player.</p>
      )}

      {!error && !tooShort && busy && <p className="empty-note">Searching&hellip;</p>}

      {!error && !tooShort && !busy && rows.length === 0 && (
        <p className="empty-note">No player matches &ldquo;{text}&rdquo;.</p>
      )}

      {!error && rows.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>NFL</th>
                <th>EDFL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (r) {
                const standing = edflStanding(r);
                const d = designationFor(r.injury_status);
                return (
                  <tr key={r.player_id}>
                    {/* Through PlayerLink like every other player name in the
                        app, so the card opens in its own window exactly the
                        way it does from a cap sheet row. */}
                    <td data-label="Player">
                      <PlayerLink playerId={r.player_id}>{r.full_name}</PlayerLink>
                    </td>
                    {/* Position and NFL team are not decoration. Twenty
                        full_name values in the player pool are duplicates, and
                        these two columns are the only thing on the row that
                        tells them apart. */}
                    <td data-label="Pos">{r.position || ''}</td>
                    <td data-label="NFL">{r.nfl_team || ''}</td>
                    {/* One wrapper element, not two siblings: below 640px the
                        cell becomes a flex row and every child becomes an
                        item, so bare siblings would sit beside each other with
                        the label wedged between them. */}
                    <td data-label="EDFL">
                      <span>
                        <strong>{standing.primary}</strong>
                        {standing.secondary ? (
                          <span className="row-note"> &middot; {standing.secondary}</span>
                        ) : null}
                      </span>
                    </td>
                    <td data-label="Status">
                      {d ? (
                        <span className={toneClass(d.tone)} title={d.full}>
                          {d.label}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* THE TRUNCATION NOTICE IS REQUIRED, NOT OPTIONAL. search_players()
          clamps at 50 rows whatever it is asked for, and a two-letter query
          reaches that today. A list that silently stops looks complete
          forever, which is the failure this project keeps recording. */}
      {!error && capped && (
        <p className="row-note warn">
          Showing the first {RESULT_CAP} matches. Add another letter to narrow the search.
        </p>
      )}

      {!error && !tooShort && !busy && rows.length > 0 && !capped && (
        <p className="row-note">
          {rows.length} {rows.length === 1 ? 'player' : 'players'} found.
        </p>
      )}
    </div>
  );
}

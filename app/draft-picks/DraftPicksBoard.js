'use client';

import { useState } from 'react';
import PlayerLink from '../../components/PlayerLink';
import { formatShortDateTime } from '../../lib/formatDate';

// One tab per season, two table shapes underneath.
//
// THE TAB LIST COMES FROM THE ROWS, NEVER FROM A RANGE. It is 2023 through 2029
// today, and it is 2030 the day the rollover writes that class -- the same
// lesson as the scoreboard's week tabs, where assuming fourteen Thursdays was
// wrong twice over. Do not hard-code the years or the count.
//
// WHICH SHAPE A SEASON GETS IS THE DATABASE'S ANSWER, NOT A YEAR COMPARISON.
// draft_completed is bool_and(used_by_contract_id is not null) over the season,
// and order_set is bool_and(pick_number is not null). A season whose order is
// set but which has not been drafted reads pick numbers and still shows no
// player -- so when the 2027 order is published, this page changes shape on its
// own with no code change.
//
// THESE ARE `.ledger` TABLES, NOT `.grid-table`. CLAUDE.md says it twice:
// .grid-table is for NUMBERS, .ledger is for ROWS A HUMAN READS.
// .grid-table tbody td is monospace, tabular-nums, right-aligned and
// white-space: nowrap, and table.grid-table carries min-width: 640px -- so the
// History column, whose longest line measures 79 characters, would become one
// unbreakable run and the table's width the sum of the longest ones. That is
// the Sleeper Sync table's 332px of sideways scroll.
//
// EVERY <td> CARRIES data-label. The 640px card flip is
// content: attr(data-label) on td::before and styles td only.
//
// History lines are wrapped in ONE <div> on purpose: below 640px
// .ledger tbody td becomes display:flex; justify-content:space-between, so
// every child of the cell is a flex item -- bare sibling divs would lay the
// history lines out side by side instead of stacked.
//
// This History renderer is a deliberate copy of the one in
// components/DraftPicksPanel.js rather than a shared import. It is twelve lines
// with no logic in it, and extracting it would mean editing an installed,
// audited file to save nothing. If it ever grows a decision, extract it then.

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

export default function DraftPicksBoard(props) {
  const rows = props.rows || [];

  const seasons = [];
  rows.forEach(function (r) {
    if (seasons.indexOf(r.season_year) === -1) seasons.push(r.season_year);
  });
  seasons.sort(function (a, b) {
    return a - b;
  });

  // Land on the league's current season when it has picks, otherwise the first
  // tab. Never assume the current season is in the list.
  const landing =
    seasons.indexOf(props.initialSeason) !== -1 ? props.initialSeason : seasons[0];
  const [season, setSeason] = useState(landing);

  const shown = rows.filter(function (r) {
    return r.season_year === season;
  });

  const completed = shown.length > 0 && shown[0].draft_completed;
  const orderSet = shown.length > 0 && shown[0].order_set;

  return (
    <div>
      <div className="tabs">
        {seasons.map(function (y) {
          return (
            <button
              key={y}
              type="button"
              className={'tab' + (y === season ? ' is-active' : '')}
              onClick={function () {
                setSeason(y);
              }}
            >
              {y}
            </button>
          );
        })}
      </div>

      <p className="row-note">
        {completed
          ? shown.length + ' picks. Draft complete.'
          : orderSet
          ? shown.length + ' picks. Draft order set; the draft has not been held.'
          : shown.length +
            ' picks. The draft order is not set, so picks are listed by round and then by the' +
            ' original owner’s team name.'}
      </p>

      {completed ? (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Pick</th>
                <th>Player</th>
                <th>Drafted by</th>
                <th>Owned now by</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(function (r) {
                return (
                  <tr key={r.pick_id}>
                    <td data-label="Pick">{r.pick_label}</td>
                    <td data-label="Player">
                      <PlayerLink playerId={r.player_id}>{r.player_name || '—'}</PlayerLink>
                      {r.player_position ? (
                        <span className="row-note"> {r.player_position}</span>
                      ) : null}
                    </td>
                    <td data-label="Drafted by">
                      <span className="team-name">{r.current_team_name}</span>
                      {/*
                        The team on the clock is current_team_id, which is the
                        original owner unless the slot was traded before it was
                        used. No 2023-2026 slot was, so this note draws on no row
                        today -- it is here for the first 2027 pick that is
                        acquired and then used.
                      */}
                      {r.pick_changed_hands ? (
                        <span className="row-note"> via {r.original_team_name}</span>
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
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Pick</th>
                <th>Original owner</th>
                <th>Current owner</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(function (r) {
                return (
                  <tr key={r.pick_id}>
                    <td data-label="Pick">{r.pick_label}</td>
                    <td data-label="Original owner">
                      <span className="team-name">{r.original_team_name}</span>
                    </td>
                    <td data-label="Current owner">
                      {r.pick_changed_hands ? (
                        <span className="team-name">{r.current_team_name}</span>
                      ) : (
                        <span className="row-note">Unchanged</span>
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

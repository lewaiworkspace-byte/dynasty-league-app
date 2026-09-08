'use client';

import { useMemo, useState } from 'react';
import PlayerLink from '../../components/PlayerLink';
import { formatDate, formatDateTime } from '../../lib/formatDate';
import {
  REPORT_COLUMNS,
  DESIGNATIONS,
  shapeRow,
  compareRows,
} from '../../lib/injuryReport';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

// Rostered first, and it is the default, because that is what an owner opens
// this page for. The free agents are one click away and they are the half that
// drives a waiver claim, so they are never more than a toggle out of reach.
const SCOPES = [
  { key: 'rostered', label: 'Rostered' },
  { key: 'free', label: 'Free agents' },
  { key: 'all', label: 'Everyone' },
];

function toneClass(tone) {
  if (tone === 'bad') return 'status status-bad';
  if (tone === 'warn') return 'status status-live';
  return 'status status-good';
}

export default function InjuryReportTable(props) {
  const all = useMemo(
    function () {
      return (props.rows || []).map(shapeRow);
    },
    [props.rows]
  );

  const [scope, setScope] = useState('rostered');
  const [position, setPosition] = useState('ALL');
  const [team, setTeam] = useState('ALL');
  const [name, setName] = useState('');
  const [sortKey, setSortKey] = useState('severity');
  const [sortDir, setSortDir] = useState('asc');

  const lastRun = props.lastRun;

  function handleSort(col) {
    const key = col.sortKey || col.key;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    // Status opens most-serious-first; everything else opens A-Z.
    setSortDir('asc');
  }

  const activeCol =
    REPORT_COLUMNS.find(function (c) {
      return (c.sortKey || c.key) === sortKey;
    }) || REPORT_COLUMNS[3];

  const needle = name.trim().toLowerCase();

  // filter() returns a fresh array each time, so the sort below never mutates
  // the memoised source.
  const rows = all
    .filter(function (r) {
      if (scope === 'rostered') return r.is_rostered;
      if (scope === 'free') return !r.is_rostered;
      return true;
    })
    .filter(function (r) { return position === 'ALL' || r.position === position; })
    .filter(function (r) { return team === 'ALL' || r.edfl_team === team; })
    .filter(function (r) {
      return !needle || r.full_name.toLowerCase().indexOf(needle) !== -1;
    })
    .sort(function (a, b) { return compareRows(a, b, activeCol, sortDir); });

  const exportQuery =
    '?scope=' + encodeURIComponent(scope) +
    '&position=' + encodeURIComponent(position) +
    '&team=' + encodeURIComponent(team) +
    '&q=' + encodeURIComponent(name.trim());

  const rosteredCount = all.filter(function (r) { return r.is_rostered; }).length;
  const freeCount = all.length - rosteredCount;

  return (
    <>
      {/*
        THE BANNER. Its timestamp is injury_sync_runs.completed_at on the newest
        completed pull -- when the data actually landed. It is deliberately not
        "now", not the page render time, and not the moment the button was
        pressed: an owner deciding a lineup on a Sunday morning needs to know
        how old this is, and every one of those three would have overstated it.
      */}
      <div
        className="form-notice"
        style={{ marginTop: 4, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}
      >
        <strong>
          {lastRun && lastRun.completed_at
            ? 'Current per Sleeper as of ' + formatDateTime(lastRun.completed_at)
            : 'Not yet pulled from Sleeper'}
        </strong>
        <span className="empty-note">
          {lastRun && lastRun.completed_at
            ? (lastRun.trigger_source === 'scheduled'
                ? 'Daily automatic pull. '
                : 'Manual pull. ') +
              'Sleeper updates continuously; this page shows the last pull, not live data.'
            : 'A commissioner needs to run the first pull before this report has anything in it.'}
        </span>
      </div>

      <p className="subhead">
        Every EDFL player carrying an NFL injury designation, plus anyone who
        cleared one in the last seven days. Reference only &mdash; a designation
        here has no effect on the cap, on roster counts, or on whether a move is
        legal.
      </p>

      <div className="admin-form">
        <div className="form-row">
          <label>
            Show
            <select value={scope} onChange={function (e) { setScope(e.target.value); }}>
              {SCOPES.map(function (s) {
                const n = s.key === 'rostered' ? rosteredCount : s.key === 'free' ? freeCount : all.length;
                return (
                  <option key={s.key} value={s.key}>
                    {s.label} ({n})
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Position
            <select value={position} onChange={function (e) { setPosition(e.target.value); }}>
              <option value="ALL">All positions</option>
              {POSITIONS.map(function (p) {
                return <option key={p} value={p}>{p}</option>;
              })}
            </select>
          </label>
          <label>
            EDFL team
            <select
              value={team}
              onChange={function (e) { setTeam(e.target.value); }}
              disabled={scope === 'free'}
            >
              <option value="ALL">All teams</option>
              {(props.teams || []).map(function (t) {
                return <option key={t} value={t}>{t}</option>;
              })}
            </select>
          </label>
          <label style={{ flex: '1 1 220px' }}>
            Name
            <input
              type="text"
              value={name}
              placeholder="Filter by player name"
              onChange={function (e) { setName(e.target.value); }}
            />
          </label>
        </div>
      </div>

      {/*
        The downloads carry the CURRENT filters, not the whole table. A file
        that quietly contains more than the screen it came from is the same
        class of lie as a truncated one.
      */}
      <div className="page-actions" style={{ marginTop: 12 }}>
        <a className="btn btn-quiet" href={'/injury-report/export' + exportQuery + '&format=csv'}>
          Download CSV
        </a>
        <a className="btn btn-quiet" href={'/injury-report/export' + exportQuery + '&format=xlsx'}>
          Download Excel
        </a>
        <a className="btn btn-quiet" href={'/injury-report/export' + exportQuery + '&format=pdf'}>
          Download PDF
        </a>
      </div>

      <p className="row-note">
        Showing {rows.length} of {all.length}. Click any column heading to sort.
        <strong> Status</strong> sorts by severity &mdash; IR and PUP first,
        Questionable last &mdash; not alphabetically.
      </p>

      {rows.length === 0 ? (
        <p className="empty-note">
          {all.length === 0
            ? 'Nobody is carrying an injury designation right now.'
            : 'No player matches those filters.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="ledger pool-table">
            <thead>
              <tr>
                {REPORT_COLUMNS.map(function (c) {
                  const key = c.sortKey || c.key;
                  const active = sortKey === key;
                  return (
                    <th
                      key={c.key}
                      className={
                        (c.numeric ? 'col-num ' : '') + 'th-sort' + (active ? ' is-sorted' : '')
                      }
                      tabIndex={0}
                      role="columnheader"
                      onClick={function () { handleSort(c); }}
                      onKeyDown={function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSort(c);
                        }
                      }}
                      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {c.label}
                      <span className="sort-caret">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(function (r) {
                return (
                  <tr key={r.player_id}>
                    <td data-label="Player">
                      <PlayerLink playerId={r.player_id}>{r.full_name}</PlayerLink>
                    </td>
                    <td data-label="Pos">{r.position}</td>
                    <td data-label="NFL">{r.nfl_team || '—'}</td>
                    <td data-label="Status">
                      <span className={toneClass(r.tone)} title={r.designationFull}>
                        {r.designation}
                      </span>
                    </td>
                    <td data-label="Injury">{r.injury_body_part || '—'}</td>
                    <td data-label="EDFL Team">
                      {r.edfl_team ? (
                        <a href={'/team/' + r.edfl_team_id}>{r.edfl_team}</a>
                      ) : (
                        <span className="empty-note">Free agent</span>
                      )}
                    </td>
                    <td data-label="Slot">{r.edfl_slot || '—'}</td>
                    <td data-label="Change">
                      {r.change ? (
                        <span className="void-tag" style={{ marginLeft: 0 }}>{r.change}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    {/*
                      One formatDate() for both meanings on purpose: it already
                      renders a bare DATE unshifted and a timestamptz in
                      Eastern, which is exactly the difference between an injury
                      start date and a changed-at instant.
                    */}
                    <td data-label="Since">{r.since ? formatDate(r.since) : '—'}</td>
                    <td data-label="Note">{r.injury_notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        THE LEGEND EXISTS BECAUSE THE COLUMN DOES. Every code the report can
        draw is listed here, generated from the same map the cells read, so a
        code can never appear on the page with nothing explaining it -- and a
        code Sleeper adds tomorrow shows up as itself rather than disappearing.
      */}
      <h2 className="section-heading" style={{ marginTop: 28 }}>What the codes mean</h2>
      {/* .legend is a flex row and its gap does the separating -- no bullets
          between items, or each separator becomes its own flex child. */}
      <div className="legend">
        {Object.keys(DESIGNATIONS).map(function (code) {
          const d = DESIGNATIONS[code];
          return (
            <span key={code}>
              <strong>{d.label}</strong> &nbsp;{d.full}
            </span>
          );
        })}
      </div>
      <p className="empty-note">
        <strong>Since</strong> is the injury&apos;s start date when Sleeper gives
        one, and otherwise the date the designation last changed.
        <strong> Change</strong> marks anything new, changed or cleared in the
        last seven days.
      </p>
    </>
  );
}

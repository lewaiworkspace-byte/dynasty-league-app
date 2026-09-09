'use client';

import { useState, useTransition } from 'react';
import PlayerLink from '../../components/PlayerLink';
import { formatShortDateTime } from '../../lib/formatDate';
import { loadTransactionPage } from './actions';

// FILTERS AND SORT LIVE IN THE DATABASE, NOT HERE. Every control on this page
// turns into an argument to league_transactions(); nothing is filtered or sorted
// client-side. Filtering a page of 100 in JavaScript would silently mean
// "filter the 100 rows I happen to have", which is a different answer from the
// one the owner asked for and looks identical on screen.
//
// PAGING IS BY CURSOR, NOT OFFSET. 130 rookie signings share one timestamp to
// the microsecond, so an offset page boundary landing inside that block would
// repeat or skip rows as soon as anything new arrived. The cursor is
// (occurred_at, log_id), which is total and stable.
//
// LOAD MORE ONLY APPEARS FOR THE TIME SORTS. Sorting by player or team is a
// browsing affordance, not a paging contract -- the database refuses a cursor
// with those sorts rather than pretending, so the button is not offered.

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'player', label: 'Player name' },
  { value: 'team', label: 'Team name' },
];

// Plain-English names for the kinds. A kind with no entry falls back to the
// database's own label rather than disappearing.
//
// RECONCILED BY DIFF AGAINST THE VIEW, NOT BY EYE (SR-36). This map is the
// same vocabulary league_transaction_log's whitelist holds, written a second
// time in a second language, and the two are compared one-for-one whenever
// either changes. The list below is every kind the log admits as of migration
// fafeed_02 (September 9 2026); if it and the whitelist ever disagree the
// symptom is silent -- an unlabelled chip, not an error.
//
// SEPTEMBER 9 2026: the five free agency entries are new, and so are three
// that had been reachable from the view all along and were never labelled --
// extended, released_june1 and restructure_reversed. All three still have zero
// rows today. They are here now rather than on the day they first occur,
// because the first June 1 cut of a season is a bad moment to discover that
// the league log has no word for it.
const KIND_LABELS = {
  signed_rookie: 'Rookie signings',
  signed_auction: 'Auction signings',
  signed_free_agent: 'Free agency signings',
  signed_practice_squad: 'Practice squad signings',
  extended: 'Extensions',
  fifth_year_option_contract: 'Option contracts',
  released: 'Releases',
  released_june1: 'Releases (June 1)',
  cut_reversed: 'Reversed cuts',
  traded: 'Trades',
  restructured: 'Restructures',
  restructure_reversed: 'Reversed restructures',
  expired: 'Expired contracts',
  roster_taxi: 'Taxi moves',
  roster_ir: 'IR moves',
  roster_active: 'Activations',
  fifth_year_option_exercised: 'Options exercised',
  fifth_year_option_declined: 'Options declined',
  fifth_year_option_reversed: 'Options reversed',
  fa_offer_lost: 'Offers that lost',
  fa_offer_passed_over: 'Offers passed over',
  fa_offer_withdrawn: 'Offers withdrawn',
};

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind.replace(/_/g, ' ');
}

// WHICH TEAM A ROW BELONGS TO. The feed carries two team columns and which one
// is filled depends on the direction of the event: a signing or a trade-in
// fills team_to, a release, a losing offer or a trade-out fills team_from. A
// trade fills both.
//
// This column was added September 9 2026 because the commissioner could not
// tell from the log who had signed a player. The team name has always been
// inside the description sentence -- "Signed by Awful Lot - 1-year deal" --
// but a sentence is not a column, and a reader scanning fifty rows for one
// team's moves was reading prose rather than looking down a line.
function teamCell(r) {
  if (r.team_from && r.team_to && r.team_from !== r.team_to) {
    return r.team_from + ' → ' + r.team_to;
  }
  return r.team_to || r.team_from || '—';
}

const TIME_SORTS = ['newest', 'oldest'];

export default function TransactionLog({
  initialRows,
  initialCursorAt,
  initialCursorId,
  pageSize,
  kinds,
  teams,
}) {
  const [rows, setRows] = useState(initialRows || []);
  const [cursorAt, setCursorAt] = useState(initialCursorAt);
  const [cursorId, setCursorId] = useState(initialCursorId);
  const [exhausted, setExhausted] = useState((initialRows || []).length < pageSize);
  const [error, setError] = useState('');

  const [selectedKinds, setSelectedKinds] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');

  const [working, startTransition] = useTransition();

  function currentFilters() {
    return {
      kinds: selectedKinds,
      teamId: teamId || null,
      search: search,
      // Bare calendar dates, passed straight through. league_transactions()
      // takes them as dates and resolves them in Eastern, because a date has no
      // zone and converting it here would use the browser's. The "to" date is
      // inclusive of the whole day named.
      from: from ? from : null,
      to: to ? to : null,
      sort: sort,
      limit: pageSize,
    };
  }

  function applyFilters(nextSort) {
    const f = currentFilters();
    if (nextSort) f.sort = nextSort;
    setError('');
    startTransition(async function () {
      let res;
      try {
        res = await loadTransactionPage(f);
      } catch (e) {
        setError('The request did not reach the server.');
        return;
      }
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows(res.data.rows);
      setCursorAt(res.data.cursorAt);
      setCursorId(res.data.cursorId);
      setExhausted(res.data.rows.length < f.limit);
    });
  }

  function loadMore() {
    const f = currentFilters();
    f.cursorAt = cursorAt;
    f.cursorId = cursorId;
    setError('');
    startTransition(async function () {
      let res;
      try {
        res = await loadTransactionPage(f);
      } catch (e) {
        setError('The request did not reach the server.');
        return;
      }
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows(rows.concat(res.data.rows));
      setCursorAt(res.data.cursorAt);
      setCursorId(res.data.cursorId);
      setExhausted(res.data.rows.length < f.limit);
    });
  }

  function toggleKind(kind) {
    const next = selectedKinds.indexOf(kind) === -1
      ? selectedKinds.concat([kind])
      : selectedKinds.filter(function (k) {
          return k !== kind;
        });
    setSelectedKinds(next);
  }

  function clearAll() {
    setSelectedKinds([]);
    setTeamId('');
    setSearch('');
    setFrom('');
    setTo('');
    setSort('newest');
    setError('');
    startTransition(async function () {
      const res = await loadTransactionPage({ sort: 'newest', limit: pageSize });
      if (res.ok) {
        setRows(res.data.rows);
        setCursorAt(res.data.cursorAt);
        setCursorId(res.data.cursorId);
        setExhausted(res.data.rows.length < pageSize);
      }
    });
  }

  const canPage = TIME_SORTS.indexOf(sort) !== -1;

  return (
    <div>
      <section className="assistant-box">
        <div className="control-row">
          {/* The base 'btn' class is carried on every one of these. Bare
              modifiers -- btn-quiet or btn-secondary on their own -- render at a
              38px tap target with no border, which is the defect the September 7
              audit flagged on this file specifically. Fixed here rather than
              left for the sweep, because the file was being replaced anyway. */}
          {(kinds || []).map(function (k) {
            const on = selectedKinds.indexOf(k.kind) !== -1;
            return (
              <button
                key={k.kind}
                type="button"
                className={on ? 'btn btn-secondary' : 'btn btn-quiet'}
                disabled={working}
                onClick={function () {
                  toggleKind(k.kind);
                }}
              >
                {kindLabel(k.kind)} ({k.rows})
              </button>
            );
          })}
        </div>

        <div className="control-row">
          <label htmlFor="txn-search" className="stat-label">
            Player or team
          </label>
          <input
            id="txn-search"
            type="text"
            value={search}
            placeholder="e.g. Metcalf, or Awful Lot"
            onChange={function (e) {
              setSearch(e.target.value);
            }}
          />

          <label htmlFor="txn-team" className="stat-label">
            Team
          </label>
          <select
            id="txn-team"
            value={teamId}
            onChange={function (e) {
              setTeamId(e.target.value);
            }}
          >
            <option value="">Any team</option>
            {(teams || []).map(function (t) {
              return (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="control-row">
          <label htmlFor="txn-from" className="stat-label">
            From
          </label>
          <input
            id="txn-from"
            type="date"
            value={from}
            onChange={function (e) {
              setFrom(e.target.value);
            }}
          />
          <label htmlFor="txn-to" className="stat-label">
            To
          </label>
          <input
            id="txn-to"
            type="date"
            value={to}
            onChange={function (e) {
              setTo(e.target.value);
            }}
          />

          <label htmlFor="txn-sort" className="stat-label">
            Sort
          </label>
          <select
            id="txn-sort"
            value={sort}
            onChange={function (e) {
              setSort(e.target.value);
              applyFilters(e.target.value);
            }}
          >
            {SORTS.map(function (s) {
              return (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              );
            })}
          </select>
        </div>

        <div className="control-row">
          <button
            type="button"
            className="btn"
            disabled={working}
            onClick={function () {
              applyFilters();
            }}
          >
            {working ? 'Loading…' : 'Apply'}
          </button>
          <button type="button" className="btn btn-quiet" disabled={working} onClick={clearAll}>
            Clear
          </button>
        </div>
      </section>

      {error ? <div className="form-error">{error}</div> : null}

      {rows.length === 0 ? (
        <p className="empty-note">Nothing matches those filters.</p>
      ) : (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Player</th>
                <th>Team</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (r) {
                return (
                  <tr key={r.log_id}>
                    <td>{formatShortDateTime(r.occurred_at)}</td>
                    <td>{r.title}</td>
                    <td>
                      <PlayerLink playerId={r.player_id}>
                        {r.player_name || '—'}
                      </PlayerLink>
                      {r.player_position ? (
                        <span className="row-note"> {r.player_position}</span>
                      ) : null}
                    </td>
                    <td>{teamCell(r)}</td>
                    <td>{r.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="control-row">
        <span className="row-note">
          Showing {rows.length} transaction{rows.length === 1 ? '' : 's'}.
        </span>
        {canPage && !exhausted ? (
          <button type="button" className="btn btn-secondary" disabled={working} onClick={loadMore}>
            {working ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
        {!canPage ? (
          <span className="row-note">
            Sorted by name — narrow the filters to see more than the first {pageSize}.
          </span>
        ) : null}
      </div>
    </div>
  );
}

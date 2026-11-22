'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../components/PlayerLink';
import ExplainButton from '../../components/ExplainButton';
import { formatDate } from '../../lib/formatDate';

// THE WEEKLY PLAYER VALUE CHART -- UI test batch 12, November 13, 2026.
//
// Lewis's rulings PVC-1 to PVC-15 (Decision Records, EDFL_PlayerValueChart_
// Rulings_2026-11-11.md and Addenda 1-2): a chart every Thursday at 6:00 AM ET
// for every player ever signed, formula v0.3, built by the database
// (edfl_pvc_build) and read here through edfl_pvc_weekly_chart(date). On the
// test site every signed-in user sees every chart, back-filled ones included
// (PVC-14). When owners see it on live is still his ruling.
//
// EVERY FIGURE ON THIS SCREEN IS A COLUMN OF THE READER. The value, the total,
// the rank, both changes (this week and since the anchor chart), the market
// floor, the youth protection and the injury factor are computed in the
// database (SR-23). This file filters, sorts and formats; it adds, subtracts
// and rounds nothing.
//
// PPV IS NOT MONEY (money-and-dates.md): bare numbers, .v-ppv for colour, no
// dollar sign. A change is the reader's signed integer with a sign in front.

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K'];

const SORTS = [
  { key: 'value', label: 'Value' },
  { key: 'up', label: 'Rising this week' },
  { key: 'down', label: 'Falling this week' },
  { key: 'base', label: 'Change since the anchor chart' },
  { key: 'name', label: 'Name' },
];

function ppv(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('en-US');
}

function pts(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function signed(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n === 0) return '0';
  return (n > 0 ? '+' : '−') + Math.abs(n).toLocaleString('en-US');
}

function changeClass(v) {
  const n = Number(v || 0);
  if (n > 0) return 'edfl-pvw-chg is-up';
  if (n < 0) return 'edfl-pvw-chg is-down';
  return 'edfl-pvw-chg';
}

// The edition's label: "Thu, Nov 12 · through Week 9".
function editionLabel(e) {
  const d = formatDate(e.chart_date);
  const wk = Number(e.weeks_completed || 0);
  return d + (wk > 0 ? ' · through Week ' + wk : ' · before Week 1 was complete');
}

function compare(a, b, key) {
  if (key === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
  if (key === 'up') return Number(b.change_week) - Number(a.change_week) || Number(b.per_year_value) - Number(a.per_year_value);
  if (key === 'down') return Number(a.change_week) - Number(b.change_week) || Number(b.per_year_value) - Number(a.per_year_value);
  if (key === 'base') return Number(b.change_since_base) - Number(a.change_since_base) || Number(b.per_year_value) - Number(a.per_year_value);
  // value: the chart's own order, by position rank within the value
  return Number(b.per_year_value) - Number(a.per_year_value) || (a.pos_rank || 0) - (b.pos_rank || 0);
}

export default function WeeklyValuesTable({ editions, selected, rows, anchorDate }) {
  const router = useRouter();
  const [pos, setPos] = useState('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('value');

  const shown = useMemo(
    function () {
      const q = search.trim().toLowerCase();
      return (rows || [])
        .filter(function (r) {
          if (pos !== 'All' && r.player_position !== pos) return false;
          if (q && (r.full_name || '').toLowerCase().indexOf(q) === -1) return false;
          return true;
        })
        .slice()
        .sort(function (a, b) {
          return compare(a, b, sortKey);
        });
    },
    [rows, pos, search, sortKey]
  );

  function onDate(e) {
    router.push('/values?view=weekly&date=' + encodeURIComponent(e.target.value));
  }

  const anchorLabel = anchorDate ? formatDate(anchorDate) : 'the anchor chart';

  return (
    <div className="edfl-pvw">
      <div className="edfl-pvw-head edfl-explain-host">
        <label className="edfl-pvw-date">
          <span className="edfl-pvw-label">Chart of</span>
          <select value={selected.chart_date} onChange={onDate} aria-label="Weekly chart date">
            {editions.map(function (e) {
              return (
                <option key={e.chart_date} value={e.chart_date}>
                  {editionLabel(e)}
                </option>
              );
            })}
          </select>
        </label>
        <ExplainButton label="How the weekly value is calculated" title="How the weekly value is calculated">
          <ul>
            <li>It starts from each player&rsquo;s value on the {anchorLabel} chart.</li>
            <li>
              Every Thursday at 6:00 AM ET it counts only the games that have already kicked off,
              scored by EDFL&rsquo;s rules.
            </li>
            <li>
              It compares his points per game with what a player at his {anchorLabel} price usually
              scores at his position, and moves his value by the gap.
            </li>
            <li>
              The gap counts for more the more games he has played. A rise counts in full after 4
              games, a fall after 8, so a slow start moves him slowly.
            </li>
            <li>
              First- and second-year players fall two to three times more slowly than they rise:
              the younger he is for his position, the more protection.
            </li>
            <li>
              An injury factor compares his time on a reserve list (now, in his last 17 weeks and
              over his career) with where it stood on {anchorLabel}.
            </li>
            <li>
              A value never goes below 9, nor below the per-year value of a winning in-season bid
              while he stays on that contract (the market floor).
            </li>
            <li>Total is the per-year value times the multiplier for his likely contract length.</li>
          </ul>
        </ExplainButton>
      </div>

      <p className="edfl-pvw-meta">
        {rows.length.toLocaleString('en-US')} players ever signed · games through{' '}
        {Number(selected.weeks_completed) > 0 ? 'Week ' + selected.weeks_completed : 'the opener'} · formula{' '}
        {selected.formula_version} · changes are against the previous Thursday (the first chart against {anchorLabel})
      </p>

      <div className="edfl-pvw-controls">
        <div className="edfl-pvw-pills" role="group" aria-label="Position">
          {POSITIONS.map(function (p) {
            return (
              <button
                key={p}
                type="button"
                className={'edfl-pvw-pill' + (pos === p ? ' is-on' : '')}
                aria-pressed={pos === p}
                onClick={function () {
                  setPos(p);
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <div className="edfl-pvw-tools">
          <input
            type="search"
            className="edfl-pvw-search"
            placeholder="Search players"
            aria-label="Search players"
            value={search}
            onChange={function (e) {
              setSearch(e.target.value);
            }}
          />
          <select
            className="edfl-pvw-sort"
            aria-label="Sort"
            value={sortKey}
            onChange={function (e) {
              setSortKey(e.target.value);
            }}
          >
            {SORTS.map(function (s) {
              return (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty-note">No players match this filter.</p>
      ) : (
        <ul className="edfl-pvw-list">
          {shown.map(function (r) {
            const floorApplied =
              r.market_floor !== null && r.market_floor !== undefined && Number(r.market_floor) > Number(r.model_value);
            const injured = r.injury_factor !== null && Number(r.injury_factor) !== 1;
            const young = r.fall_protection !== null && Number(r.fall_protection) > 1;
            return (
              <li key={r.player_id} className="edfl-pvw-row">
                <div className="edfl-pvw-main">
                  <span className="edfl-pvw-rank">
                    {r.player_position} {r.pos_rank}
                  </span>
                  <div className="edfl-pvw-who">
                    <PlayerLink playerId={r.player_id} className="edfl-pvw-name">
                      {r.full_name}
                    </PlayerLink>
                    <span className="edfl-pvw-sub">
                      {r.nfl_team || 'No NFL team'} · {r.team_abbrev ? r.team_abbrev : 'Not on an EDFL roster'}
                      {r.value_tier ? ' · ' + r.value_tier : ''}
                    </span>
                  </div>
                  <div className="edfl-pvw-val">
                    <b className="v-ppv">{ppv(r.per_year_value)}</b>
                    <span className={changeClass(r.change_week)} title="Change from the previous chart">
                      {signed(r.change_week)}
                    </span>
                  </div>
                </div>
                <div className="edfl-pvw-line">
                  <span>
                    Total <b className="v-ppv">{ppv(r.total_ppv)}</b> · {r.likely_years}{' '}
                    {Number(r.likely_years) === 1 ? 'yr' : 'yrs'}
                  </span>
                  <span>
                    Since {anchorDate ? formatDate(anchorDate).replace(/, \d{4}$/, '') : 'anchor'}{' '}
                    <span className={changeClass(r.change_since_base)}>{signed(r.change_since_base)}</span>
                  </span>
                  <span>
                    {r.games} {Number(r.games) === 1 ? 'game' : 'games'} · {pts(r.points)} pts
                  </span>
                  {young ? <span className="edfl-pvw-tag">Young player ×{r.fall_protection}</span> : null}
                  {injured ? <span className="edfl-pvw-tag is-warn">Injury ×{r.injury_factor}</span> : null}
                  {r.on_reserve ? <span className="edfl-pvw-tag is-warn">On a reserve list</span> : null}
                  {floorApplied ? <span className="edfl-pvw-tag">Market floor {ppv(r.market_floor)}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

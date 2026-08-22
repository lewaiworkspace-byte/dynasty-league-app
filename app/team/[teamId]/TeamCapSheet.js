'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CutPlayerDialog from './CutPlayerDialog';
import { formatMoney } from '../../../lib/formatMoney';

// KNOWN STALE -- do not treat this number as the rule.
//
// Rule book v11 abolished BOTH the 111% figure and the four-year rolling
// rollover this constant was built on. Under 5.5 a team's Salary Ceiling is
// its own individual cap: the league base cap for the season plus that
// team's rollover carried in from the immediately preceding season, carried
// one season at a time. That is per-team and rollover-derived, so it cannot
// be a single shared multiplier.
//
// Rebuilding this row is to-do item 1 and needs per-team rollover data. The
// display is left byte-identical to what owners already see so this Cut
// Player change introduces no silent number movement; the footnote under the
// grid tells owners the figure is an approximation pending that rebuild.
//
// Separately and still true: this is NOT the 1.25 in auction_tier_team_flags,
// which is the auction-specific allowance. Do not reconcile them.
const CEILING_MULTIPLIER = 1.11;

const GROWTH_RATES = [];
for (let r = -5; r <= 10; r += 1) GROWTH_RATES.push(r);

export default function TeamCapSheet(props) {
  const seasons = props.seasons;
  const currentSeasonYear = props.currentSeasonYear || seasons[0];
  const officialCaps = props.officialCaps;
  const minSpendPct = props.minSpendPct;
  const liabilities = props.liabilities;
  // Dead money per season, already INCLUDED in liabilities[yr].capHit and
  // .cashCommitted. Passed separately only so the grid can name it: a Cap
  // Hit that exceeds the sum of the players listed below it, with nothing
  // on screen accounting for the difference, reads as an arithmetic error.
  // Defaulted so an older caller that does not pass it still renders.
  const deadMoney = props.deadMoney || {};
  const cashAvailable = props.cashAvailable;
  const rosterBySeason = props.rosterBySeason;
  const canCut = Boolean(props.canCut);

  const router = useRouter();

  // Whether to draw the dead-money rows at all. Checked across the whole
  // horizon rather than per season, so the row either exists for every
  // column or for none -- a row that appears and disappears between seasons
  // would break the grid's alignment.
  const anyDeadCap = seasons.some(function (yr) {
    return deadMoney[yr] && (Number(deadMoney[yr].cap) || 0) > 0;
  });
  const anyDeadCash = seasons.some(function (yr) {
    return deadMoney[yr] && (Number(deadMoney[yr].cash) || 0) > 0;
  });

  const [tab, setTab] = useState('overview');
  const [growth, setGrowth] = useState(0);
  const [rosterSeason, setRosterSeason] = useState(seasons[0]);
  const [sortKey, setSortKey] = useState('capCharge');
  const [sortDir, setSortDir] = useState('desc');
  const [cutTarget, setCutTarget] = useState(null);

  // Cutting is a present-tense action: you can only cut a player today, not
  // in a future season. The column appears only on the current season.
  const showCut = canCut && rosterSeason === currentSeasonYear;

  const officialYears = Object.keys(officialCaps)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  const lastOfficialYear = officialYears.length
    ? officialYears[officialYears.length - 1]
    : null;

  // Projected caps are display-only and are never written back to
  // league_cap_settings, which is load-bearing for auction cap flags.
  function capFor(year) {
    if (officialCaps[year] !== undefined) {
      return { value: officialCaps[year], projected: false };
    }
    if (lastOfficialYear === null) return { value: null, projected: true };
    const base = officialCaps[lastOfficialYear];
    const steps = year - lastOfficialYear;
    // Rule book 1.9 rounds up.
    const value = Math.ceil(base * Math.pow(1 + growth / 100, steps));
    return { value: value, projected: true };
  }

  const capByYear = {};
  seasons.forEach(function (yr) {
    capByYear[yr] = capFor(yr);
  });

  function projClass(yr) {
    return capByYear[yr].projected ? ' is-projected-val' : '';
  }

  function derived(yr, fn) {
    const c = capByYear[yr];
    if (c.value === null) return '\u2014';
    return formatMoney(fn(c.value));
  }

  // Numeric columns open descending (biggest first); text columns open
  // ascending (A-Z). One shared default makes half the columns feel
  // backwards on the first click.
  const SORT_COLUMNS = [
    { key: 'name', label: 'Player', numeric: false },
    { key: 'position', label: 'Pos', numeric: false },
    { key: 'typeLabel', label: 'Type', numeric: false },
    { key: 'contract', label: 'Contract', numeric: false },
    { key: 'ppv', label: 'PPV', numeric: true },
    { key: 'capCharge', label: 'Cap Hit', numeric: true },
    { key: 'cashValue', label: 'Cash', numeric: true },
    { key: 'deadCap', label: 'Dead If Cut', numeric: true },
  ];

  function handleSort(col) {
    if (sortKey === col.key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(col.key);
    setSortDir(col.numeric ? 'desc' : 'asc');
  }

  function sortedRoster() {
    const col = SORT_COLUMNS.find(function (c) {
      return c.key === sortKey;
    });
    const rows = rosterBySeason[rosterSeason].slice();
    const dir = sortDir === 'asc' ? 1 : -1;

    rows.sort(function (a, b) {
      if (sortKey === 'contract') {
        const diff = a.startYear - b.startYear;
        if (diff !== 0) return diff * dir;
        return (a.totalSpan - b.totalSpan) * dir;
      }

      if (col && col.numeric) {
        const av = a[sortKey];
        const bv = b[sortKey];
        // Nulls sink to the bottom in both directions -- sorting them as
        // zero would bury real zeros among missing data.
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      }

      const as = String(a[sortKey] || '');
      const bs = String(b[sortKey] || '');
      return as.localeCompare(bs) * dir;
    });

    return rows;
  }

  return (
    <div>
      <div className="tabs">
        <button
          type="button"
          className={'tab' + (tab === 'overview' ? ' is-active' : '')}
          onClick={function () {
            setTab('overview');
          }}
        >
          Overview
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'roster' ? ' is-active' : '')}
          onClick={function () {
            setTab('roster');
          }}
        >
          Roster
        </button>
      </div>

      {tab === 'overview' && (
        <div>
          <div className="control-row">
            <label htmlFor="growth">Assumed annual cap growth</label>
            <select
              id="growth"
              value={growth}
              onChange={function (e) {
                setGrowth(Number(e.target.value));
              }}
            >
              {GROWTH_RATES.map(function (r) {
                return (
                  <option key={r} value={r}>
                    {(r > 0 ? '+' : '') + r + '%'}
                  </option>
                );
              })}
            </select>
            <span>
              Applies to projected seasons only. Cap Hit and Cash Committed are
              contract facts and do not move.
            </span>
          </div>

          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>&nbsp;</th>
                  {seasons.map(function (yr) {
                    return (
                      <th key={yr}>
                        <span className="year-head">
                          <span>{yr}</span>
                          <span
                            className={
                              'year-tag ' +
                              (capByYear[yr].projected
                                ? 'is-projected'
                                : 'is-official')
                            }
                          >
                            {capByYear[yr].projected ? 'PROJ' : 'SET'}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Salary Cap</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {formatMoney(capByYear[yr].value)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="grid-rule">
                  <th scope="row">Cap Ceiling</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {derived(yr, function (v) {
                          return Math.ceil(v * CEILING_MULTIPLIER);
                        })}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Cap Hit</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className="v-cap">
                        {formatMoney(liabilities[yr].capHit)}
                      </td>
                    );
                  })}
                </tr>
                {/* Only rendered when this team actually carries dead money
                    in one of the five seasons shown. Nine of ten teams see
                    no extra row. Sits directly beneath Cap Hit because it is
                    a COMPONENT of that figure, not an addition to it -- the
                    roster table below lists live contracts only, so this is
                    the line that explains why the two do not tie out. */}
                {anyDeadCap && (
                  <tr>
                    <th scope="row">&nbsp;&nbsp;of which dead money</th>
                    {seasons.map(function (yr) {
                      const d = deadMoney[yr] ? Number(deadMoney[yr].cap) || 0 : 0;
                      return (
                        <td key={yr} className={d > 0 ? 'v-dead' : ''}>
                          {d > 0 ? formatMoney(d) : '\u2014'}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr>
                  <th scope="row">Cap Space</th>
                  {seasons.map(function (yr) {
                    const c = capByYear[yr];
                    if (c.value === null) return <td key={yr}>&mdash;</td>;
                    const space = c.value - liabilities[yr].capHit;
                    return (
                      <td
                        key={yr}
                        className={
                          (space < 0 ? 'num negative' : 'num positive') +
                          projClass(yr)
                        }
                      >
                        {formatMoney(space)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="grid-rule">
                  <th scope="row">
                    Min Spend ({Math.round(minSpendPct * 100)}%)
                  </th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {derived(yr, function (v) {
                          return Math.ceil(v * minSpendPct);
                        })}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Cash Committed</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className="v-cash">
                        {formatMoney(liabilities[yr].cashCommitted)}
                      </td>
                    );
                  })}
                </tr>
                {anyDeadCash && (
                  <tr>
                    <th scope="row">&nbsp;&nbsp;of which dead cash</th>
                    {seasons.map(function (yr) {
                      const d = deadMoney[yr] ? Number(deadMoney[yr].cash) || 0 : 0;
                      return (
                        <td key={yr} className={d > 0 ? 'v-dead' : ''}>
                          {d > 0 ? formatMoney(d) : '\u2014'}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr>
                  <th scope="row">Cash Available</th>
                  {seasons.map(function (yr) {
                    const v = cashAvailable[yr];
                    return (
                      <td key={yr} className={v === undefined ? '' : 'v-cash'}>
                        {v === undefined ? '\u2014' : formatMoney(v)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="empty-note">
            Cap Ceiling is shown here as 111% of the cap. Rule book v11
            replaced that figure: a team&rsquo;s ceiling is now its own base
            cap plus its rollover from the previous season, which differs by
            team. This row has not been rebuilt yet &mdash; treat it as a
            rough approximation, not the rule. It is a different figure from
            the 125% allowance used in auction cap flags.
          </p>
          <p className="empty-note">
            SET seasons use the cap entered by the Commissioner. PROJ seasons
            are estimates only. Cash Available shows a dash for seasons with
            no budget set yet. Dead money from a cut is charged to the team
            and appears in Cap Hit and Cash Committed once a cut is made.
          </p>
        </div>
      )}

      {tab === 'roster' && (
        <div>
          <div className="control-row">
            <label htmlFor="rseason">Season</label>
            <select
              id="rseason"
              value={rosterSeason}
              onChange={function (e) {
                setRosterSeason(Number(e.target.value));
              }}
            >
              {seasons.map(function (yr) {
                return (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                );
              })}
            </select>

            <label htmlFor="rsort">Sort by</label>
            <select
              id="rsort"
              value={sortKey + ':' + sortDir}
              onChange={function (e) {
                const parts = e.target.value.split(':');
                setSortKey(parts[0]);
                setSortDir(parts[1]);
              }}
            >
              {SORT_COLUMNS.map(function (col) {
                const first = col.numeric ? 'desc' : 'asc';
                const second = col.numeric ? 'asc' : 'desc';
                return [
                  <option key={col.key + first} value={col.key + ':' + first}>
                    {col.label + (col.numeric ? ' (high-low)' : ' (A-Z)')}
                  </option>,
                  <option key={col.key + second} value={col.key + ':' + second}>
                    {col.label + (col.numeric ? ' (low-high)' : ' (Z-A)')}
                  </option>,
                ];
              })}
            </select>
          </div>

          <table className="ledger">
            <thead>
              <tr>
                {SORT_COLUMNS.map(function (col) {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={
                        (col.numeric ? 'col-num ' : '') +
                        'th-sort' +
                        (active ? ' is-sorted' : '')
                      }
                      tabIndex={0}
                      role="columnheader"
                      onClick={function () {
                        handleSort(col);
                      }}
                      onKeyDown={function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSort(col);
                        }
                      }}
                      aria-sort={
                        active
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {col.label}
                      <span className="sort-caret">
                        {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
                      </span>
                    </th>
                  );
                })}
                {showCut && <th>&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {sortedRoster().map(function (c) {
                return (
                  <tr key={c.id}>
                    <td className="team-name" data-label="Player">
                      {c.name}
                      {c.isVoidYear && <span className="void-tag"> VOID YR</span>}
                    </td>
                    <td data-label="Pos">{c.position}</td>
                    <td data-label="Type">{c.typeLabel}</td>
                    <td data-label="Contract">
                      {c.span}
                      <span className="empty-note" style={{ marginLeft: 6 }}>
                        (Yr {c.yearInDeal}/{c.totalSpan})
                      </span>
                    </td>
                    <td className="num v-ppv col-num" data-label="PPV">
                      {formatMoney(c.ppv)}
                    </td>
                    <td className="num v-cap col-num" data-label="Cap Hit">
                      {formatMoney(c.capCharge)}
                    </td>
                    <td className="num v-cash col-num" data-label="Cash">
                      {formatMoney(c.cashValue)}
                    </td>
                    <td className="num v-dead col-num" data-label="Dead If Cut">
                      {formatMoney(c.deadCap)}
                      {c.deadCapLive && c.deadCapNext > 0 && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          +{formatMoney(c.deadCapNext)} next yr
                        </span>
                      )}
                      {!c.deadCapLive && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          est.
                        </span>
                      )}
                    </td>
                    {showCut && (
                      <td data-label="Cut">
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={function () {
                            setCutTarget(c);
                          }}
                        >
                          Cut
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rosterBySeason[rosterSeason].length === 0 && (
            <p className="empty-note">
              No contracts on the books for {rosterSeason}.
            </p>
          )}

          {rosterSeason === currentSeasonYear ? (
            <p className="empty-note">
              Dead If Cut is the live settlement from the dead-money engine
              for a cut made today, including any June 1st split. Open the Cut
              dialog for the full breakdown before committing to anything.
            </p>
          ) : (
            <p className="empty-note">
              Dead If Cut is marked &ldquo;est.&rdquo; for future seasons: it
              is a static projection that cannot know how many weeks will have
              been charged or whether a June 1st split will apply. Only the
              current season shows the live figure.
            </p>
          )}
        </div>
      )}

      {cutTarget && (
        <CutPlayerDialog
          player={cutTarget}
          onClose={function () {
            setCutTarget(null);
          }}
          onDone={function () {
            setCutTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

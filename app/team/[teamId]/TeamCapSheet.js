'use client';

import { useState } from 'react';

// In-season maximum cap allowed. A team spending only the 89% floor carries
// the unused 11% into the next season, so the most any team can carry is
// 111% of that season's cap.
//
// This is NOT the 1.25 in auction_tier_team_flags. That figure is the
// OFFSEASON allowance -- teams may sit above the cap between seasons but
// must be compliant by season start. Two different ceilings; do not
// reconcile them.
//
// This 1.11 is also a simplification: the real carryover rule is a rolling
// value over a four-year period. The footnote under the grid says so.
// Duplicated fact -- see Master Version Control Section B.
const CEILING_MULTIPLIER = 1.11;

const GROWTH_RATES = [];
for (let r = -5; r <= 10; r += 1) GROWTH_RATES.push(r);

function formatMoney(n) {
  if (n === null || n === undefined) return '\u2014';
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString();
}

export default function TeamCapSheet(props) {
  const seasons = props.seasons;
  const officialCaps = props.officialCaps;
  const minSpendPct = props.minSpendPct;
  const liabilities = props.liabilities;
  const cashAvailable = props.cashAvailable;
  const rosterBySeason = props.rosterBySeason;

  const [tab, setTab] = useState('overview');
  const [growth, setGrowth] = useState(0);
  const [rosterSeason, setRosterSeason] = useState(seasons[0]);

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
            Cap Ceiling is the in-season maximum, shown here as 111% of the
            cap &mdash; a team spending only the 89% floor carries the unused
            11% forward. The full rule is a rolling calculation over four
            seasons, so treat this as an approximation. It is a different
            figure from the 125% offseason allowance used in auction cap
            flags.
          </p>
          <p className="empty-note">
            SET seasons use the cap entered by the Commissioner. PROJ seasons
            are estimates only. Cash Available shows a dash for seasons with
            no budget set yet. Dead money is not shown because no cut or trade
            mechanism exists yet &mdash; the per-player figures on the Roster
            tab are hypothetical.
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
          </div>

          <table className="ledger">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Type</th>
                <th>Contract</th>
                <th className="col-num">PPV</th>
                <th className="col-num">Cap Hit</th>
                <th className="col-num">Cash</th>
                <th className="col-num">Dead If Cut</th>
              </tr>
            </thead>
            <tbody>
              {rosterBySeason[rosterSeason].map(function (c) {
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
                    </td>
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
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { formatMoney } from '../../../lib/formatMoney';
import { n, contractTypeLabel, contractStatusLabel } from './cardHelpers';

// EDFL Earnings. The one place the two honest answers to "what has this
// player earned" sit side by side, never blended:
//
//   EARNED TO DATE  -- what teams have actually been charged for him: cash
//                      through the current season on active contracts,
//                      plus dead cash charged when a contract ended early.
//   CONTRACT VALUE  -- every dollar ever written into a contract for him,
//                      including seasons that were never paid because the
//                      contract was cut or traded away.
//
// Zach Charbonnet is the worked example: $14 of contract value, $4 earned.
// Both figures come from player_career_earnings; this file sums nothing.

export default function EarningsTab({
  header,
  earnings,
  contracts,
  years,
  currentSeasonYear,
}) {
  const contractById = useMemo(
    function () {
      const map = {};
      (contracts || []).forEach(function (c) {
        map[c.contract_id] = c;
      });
      return map;
    },
    [contracts]
  );

  if (!earnings) {
    return (
      <p className="empty-note">
        {header.full_name} has never held an EDFL contract, so there are no
        earnings to show.
      </p>
    );
  }

  const earnedToDate =
    (n(earnings.cash_through_current_season) || 0) +
    (n(earnings.dead_cash_charged) || 0);

  // Season rows, oldest first. Cash on a season of an ended contract was
  // written into the deal but not necessarily paid; the status chip says
  // which contract each season belongs to.
  const seasonRows = (years || [])
    .filter(function (y) {
      return !y.is_void_year;
    })
    .slice()
    .sort(function (a, b) {
      return a.league_season_year - b.league_season_year;
    });

  return (
    <>
      <div className="stat-strip">
        <div>
          <div className="stat-label">Earned To Date</div>
          <div className="stat-value positive">{formatMoney(earnedToDate)}</div>
        </div>
        <div>
          <div className="stat-label">Still Owed (Active)</div>
          <div className="stat-value">{formatMoney(earnings.cash_still_owed)}</div>
        </div>
        <div>
          <div className="stat-label">Career Contract Value</div>
          <div className="stat-value">
            {formatMoney(earnings.career_contract_value)}
          </div>
        </div>
        <div>
          <div className="stat-label">Dead Cash Charged</div>
          <div className="stat-value">{formatMoney(earnings.dead_cash_charged)}</div>
        </div>
        <div>
          <div className="stat-label">Teams</div>
          <div className="stat-value">{earnings.teams_played_for}</div>
        </div>
      </div>

      <p className="pc-prose">
        Earned To Date is what EDFL teams have actually been charged for{' '}
        {header.full_name}: cash through the {currentSeasonYear} season on
        active contracts, plus any dead cash charged when a contract ended
        early. Career Contract Value counts every dollar ever written into a
        contract for him, whether or not it was paid before the contract was
        cut or traded away.
      </p>

      <h2 className="section-heading">Season by season</h2>
      {seasonRows.length === 0 ? (
        <p className="empty-note">No contract seasons on record.</p>
      ) : (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Team</th>
                <th>Contract</th>
                <th>Contract Status</th>
                <th>Cash</th>
                <th>Cap Charge</th>
              </tr>
            </thead>
            <tbody>
              {seasonRows.map(function (y) {
                const c = contractById[y.contract_id];
                return (
                  <tr key={y.contract_id + '-' + y.league_season_year}>
                    <th scope="row">{y.league_season_year}</th>
                    <td style={{ textAlign: 'left' }}>
                      {c ? (
                        <a href={'/team/' + c.team_id}>{c.team_name}</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      {c ? contractTypeLabel(c.contract_type) : '—'}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <span
                        className={
                          'status ' +
                          (c && c.is_current ? 'status-good' : 'status-off')
                        }
                      >
                        {c ? contractStatusLabel(c.contract_status) : '—'}
                      </span>
                    </td>
                    <td className="num v-cash">{formatMoney(y.cash_value)}</td>
                    <td className="num v-cap">{formatMoney(y.cap_charge)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="pc-note">
        A season belonging to a cut or traded-away contract shows the cash
        that deal promised for that year; what was actually charged before
        the contract ended is inside Earned To Date and Dead Cash Charged
        above.
      </p>
    </>
  );
}

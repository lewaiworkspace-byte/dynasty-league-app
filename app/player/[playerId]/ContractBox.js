'use client';

import { useMemo, useState } from 'react';
import { formatCost, formatMoney } from '../../../lib/formatMoney';
import { n, sumVals } from './cardHelpers';

// "CONTRACT, YEAR BY YEAR" -- the card's Contract box, UI test batch 6
// (November 2026). Option B's block from the Player Card canvas inside
// Option C's page, as Lewis picked it on October 29, 2026.
//
// It reads EXACTLY what ContractTab reads and rounds EXACTLY as it does, so
// the card and Full contract details can never print two figures for one
// cell (SR-62): the shown contract is the active one, else the most recent;
// the terms line is the DEAL and stays formatMoney (player-card.md: the terms
// strip and the season tables round differently, and both are right); every
// season figure is a CHARGE and is formatCost; the current season's "if cut"
// is the live team_cut_previews settlement, later seasons the standing
// estimate marked "est."; the only arithmetic is ContractTab's own
// display-time sums (average value, guaranteed total, cumulative cash, cap %).
//
// A phone gets one card per season, the current season outlined and the void
// years folded behind "Show"; from 900px it is one table with the void years
// dimmed (CSS picks which shows). Everything else the old Contract tab had is
// on Full contract details, which this box links to.

export default function ContractBox({ header, contracts, years, livePreview, capSettings, currentSeasonYear }) {
  const [showVoid, setShowVoid] = useState(false);

  const shown = useMemo(
    function () {
      if (!contracts || contracts.length === 0) return null;
      const active = contracts.filter(function (c) {
        return c.is_current;
      });
      return active.length > 0 ? active[0] : contracts[0];
    },
    [contracts]
  );

  const shownYears = useMemo(
    function () {
      if (!shown) return [];
      return (years || []).filter(function (y) {
        return y.contract_id === shown.contract_id;
      });
    },
    [shown, years]
  );

  const capByYear = useMemo(
    function () {
      const map = {};
      (capSettings || []).forEach(function (r) {
        map[r.season_year] = { cap: n(r.fantasy_salary_cap), provisional: Boolean(r.is_provisional) };
      });
      return map;
    },
    [capSettings]
  );

  const detailsHref = '/player/' + header.player_id + '/contract';

  if (!shown) {
    return (
      <>
        <p className="edfl-pc-note">
          {header.full_name} has never held an EDFL contract. The auction and the rookie draft are
          how one starts.
        </p>
        <p className="edfl-pc-more">
          <a href={detailsHref}>Full contract details</a>
        </p>
      </>
    );
  }

  const isCurrent = Boolean(shown.is_current);
  const totalCash = n(shown.total_cash);
  const realYears = Number(shown.total_years) || 1;
  const avgValue = totalCash === null ? null : totalCash / realYears;
  const signingBonus = n(shown.signing_bonus_total);
  const gtdTotal = sumVals(
    shownYears.map(function (y) {
      return y.cash_gtd_salary;
    })
  );

  const preview = isCurrent && livePreview && livePreview.contract_id === shown.contract_id ? livePreview : null;

  let lastRealSeason = null;
  shownYears.forEach(function (y) {
    if (!y.is_void_year && (lastRealSeason === null || y.league_season_year > lastRealSeason)) {
      lastRealSeason = y.league_season_year;
    }
  });
  const faYear = lastRealSeason === null ? null : lastRealSeason + 1;

  let running = 0;
  let anyProvisional = false;
  const rows = shownYears.map(function (y) {
    running += n(y.cash_value) || 0;
    const capInfo = capByYear[y.league_season_year];
    const capHit = n(y.cap_charge);
    let pct = null;
    if (capInfo && capInfo.cap && capHit !== null) {
      pct = ((capHit / capInfo.cap) * 100).toFixed(1) + '%' + (capInfo.provisional ? '*' : '');
      if (capInfo.provisional && !y.is_void_year) anyProvisional = true;
    }
    const isNow = isCurrent && y.league_season_year === currentSeasonYear && !y.is_void_year;
    let dead = null;
    let deadNote = null;
    if (!y.is_void_year) {
      if (preview && y.league_season_year === currentSeasonYear) {
        dead = formatCost(preview.dead_cap_current_year);
        const next = n(preview.dead_cap_next_year);
        if (preview.june1_split && next) deadNote = '+' + formatCost(next) + ' next yr';
      } else {
        const est = formatCost(y.dead_cap_if_cut);
        dead = est;
        if (est !== '—') deadNote = 'est.';
      }
    }
    return { y: y, cumulative: running, pct: pct, isNow: isNow, dead: dead, deadNote: deadNote };
  });

  const realRows = rows.filter(function (r) {
    return !r.y.is_void_year;
  });
  const voidRows = rows.filter(function (r) {
    return r.y.is_void_year;
  });
  const voidSpan =
    voidRows.length === 0
      ? null
      : voidRows.length === 1
      ? String(voidRows[0].y.league_season_year)
      : voidRows[0].y.league_season_year + '–' + voidRows[voidRows.length - 1].y.league_season_year;

  const deadNext = preview ? n(preview.dead_cap_next_year) : null;

  function YearCard(props) {
    const r = props.r;
    return (
      <div className={'edfl-pc-year' + (r.isNow ? ' is-now' : '') + (r.y.is_void_year ? ' is-void' : '')}>
        <span className="edfl-pc-year-label">
          {r.y.league_season_year}
          {r.y.is_void_year ? <span className="edfl-pc-tag is-void">Void</span> : null}
        </span>
        <span className="edfl-pc-cell">
          <small>Cap hit</small>
          <span className="v-cap">{formatCost(r.y.cap_charge)}</span>
          <em>{r.pct === null ? '— of cap' : r.pct + ' of cap'}</em>
        </span>
        <span className="edfl-pc-cell">
          <small>Cash</small>
          <span className="v-cash">{formatCost(r.y.cash_value)}</span>
          <em>{formatCost(r.cumulative)} so far</em>
        </span>
        <span className="edfl-pc-cell">
          <small>If cut</small>
          {r.dead === null ? <span>—</span> : <span className="edfl-pc-deadchip">{r.dead}</span>}
          {r.deadNote ? <em>{r.deadNote}</em> : null}
        </span>
      </div>
    );
  }

  return (
    <>
      <p className="edfl-pc-terms">
        <span>
          Contract{' '}
          <b>
            {realYears} yr / {formatMoney(totalCash)}
          </b>
        </span>
        <span>
          Average <b>{formatMoney(avgValue)}</b>
        </span>
        <span>
          Signing bonus <b>{formatMoney(signingBonus)}</b>
        </span>
        <span>
          Gtd salary <b>{formatMoney(gtdTotal)}</b>
        </span>
        {faYear !== null ? (
          <span>
            Free agent <b>{isCurrent ? faYear : '—'}</b>
          </span>
        ) : null}
        {shown.signed_in_tier ? (
          <span>
            Signed in <b>{shown.signed_in_tier}</b>
          </span>
        ) : null}
        {shown.draft_year ? (
          <span>
            Drafted{' '}
            <b>
              {shown.draft_year}
              {shown.draft_round ? ' · R' + shown.draft_round : ''}
              {shown.draft_pick ? ' · #' + shown.draft_pick : ''}
            </b>
          </span>
        ) : null}
      </p>

      {!isCurrent ? (
        <p className="edfl-pc-note">
          Showing {header.full_name}&rsquo;s most recent contract. He holds no active EDFL contract.
        </p>
      ) : null}

      {/* Phone: one card per season. */}
      <div className="edfl-pc-years">
        {realRows.map(function (r) {
          return <YearCard key={r.y.league_season_year} r={r} />;
        })}
        {voidRows.length > 0 ? (
          <div className="edfl-pc-voidfold">
            <span>
              <span className="edfl-pc-tag is-void">Void</span> {voidSpan}: cap only, no cash.
            </span>
            <button
              type="button"
              className="edfl-pc-linkbtn"
              aria-expanded={showVoid}
              onClick={function () {
                setShowVoid(!showVoid);
              }}
            >
              {showVoid ? 'Hide' : 'Show'}
            </button>
          </div>
        ) : null}
        {showVoid
          ? voidRows.map(function (r) {
              return <YearCard key={r.y.league_season_year} r={r} />;
            })
          : null}
      </div>

      {/* From 900px: one table. */}
      <div className="table-scroll edfl-pc-yeartable">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Cap hit</th>
              <th>Cap % league</th>
              <th>Cash</th>
              <th>Cash cumulative</th>
              <th>Dead cap if cut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r) {
              return (
                <tr
                  key={r.y.league_season_year}
                  className={(r.isNow ? 'is-now' : '') + (r.y.is_void_year ? ' is-void' : '')}
                >
                  <th scope="row">
                    {r.y.league_season_year}
                    {r.isNow ? ' · now' : ''}
                    {r.y.is_void_year ? <span className="edfl-pc-tag is-void">Void</span> : null}
                  </th>
                  <td className="num v-cap">{formatCost(r.y.cap_charge)}</td>
                  <td className="num">{r.pct === null ? '—' : r.pct}</td>
                  <td className="num v-cash">{formatCost(r.y.cash_value)}</td>
                  <td className="num">{formatCost(r.cumulative)}</td>
                  <td className="num">
                    {r.dead === null ? (
                      '—'
                    ) : (
                      <>
                        <span className="edfl-pc-deadchip">{r.dead}</span>
                        {r.deadNote ? <span className="edfl-pc-dim"> {r.deadNote}</span> : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview ? (
        <p className="edfl-pc-note">
          If cut now is the live settlement from the dead-money engine, including any June 1st split
          {deadNext !== null && deadNext > 0 ? ', and a further ' + formatCost(deadNext) + ' lands next season' : ''}.
          Later seasons are the standing estimate. Figures here round up, so a charge never reads low.
        </p>
      ) : (
        <p className="edfl-pc-note">
          Figures here round up, so a charge never reads low. &ldquo;If cut&rdquo; is the standing
          estimate for each season.
        </p>
      )}
      {anyProvisional ? <p className="edfl-pc-note">* That season&rsquo;s league cap is provisional.</p> : null}

      <p className="edfl-pc-more">
        <a href={detailsHref}>Full contract details</a>
        <span className="edfl-pc-dim"> &middot; cap and cash breakdowns, every contract, earnings, value history</span>
      </p>
    </>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { formatMoney } from '../../../lib/formatMoney';
import { formatDate } from '../../../lib/formatDate';
import {
  n,
  sumVals,
  lastName,
  contractSpan,
  contractTypeLabel,
  contractStatusLabel,
} from './cardHelpers';
import VisualBreakdown from './VisualBreakdown';

// Contract Details: the Spotrac contract page, EDFL edition. A prose
// summary, the terms line, then Summary / Cap / Cash / Visual sub-tabs
// over the displayed contract's seasons, then the full contract history.
//
// Every dollar in every cell is a value the database computed.
// player_contract_year_breakdown exposes the exact per-season components
// of cap_charge and cash_value (its cap_* columns sum to cap_charge by
// construction), so nothing here reconstructs a component -- the legacy
// contract_years option columns are zero on every row and rule 3.3(c)
// taxi relief means subtraction in JS would simply be wrong. The only JS
// arithmetic is display-time: cumulative/remaining running sums down a
// column, cap-hit as a % of the league cap, and the average annual value.
//
// DEAD CAP: the current season shows the live engine figure from
// team_cut_previews, exactly as /team/[teamId] does; future seasons show
// the standing dead_cap_if_cut estimate, marked "est."

const SUB_SUMMARY = 'summary';
const SUB_CAP = 'cap';
const SUB_CASH = 'cash';
const SUB_VISUAL = 'visual';

const SUBTABS = [
  { key: SUB_SUMMARY, label: 'Summary' },
  { key: SUB_CAP, label: 'Cap Breakdown' },
  { key: SUB_CASH, label: 'Cash Breakdown' },
  { key: SUB_VISUAL, label: 'Visual Breakdown' },
];

export default function ContractTab({
  header,
  contracts,
  years,
  livePreview,
  capSettings,
  currentSeasonYear,
}) {
  const [sub, setSub] = useState(SUB_SUMMARY);

  // The contract the tables describe: the active one if the player has
  // one, otherwise his most recent. contracts arrives newest-first.
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
      return years.filter(function (y) {
        return y.contract_id === shown.contract_id;
      });
    },
    [shown, years]
  );

  const capByYear = useMemo(
    function () {
      const map = {};
      (capSettings || []).forEach(function (r) {
        map[r.season_year] = {
          cap: n(r.fantasy_salary_cap),
          provisional: Boolean(r.is_provisional),
        };
      });
      return map;
    },
    [capSettings]
  );

  if (!shown) {
    return (
      <p className="empty-note">
        {header.full_name} has never held an EDFL contract. The auction and
        the rookie draft are how one starts.
      </p>
    );
  }

  const name = lastName(header.full_name);
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

  // The live preview belongs only to the player's active contract.
  const preview =
    isCurrent && livePreview && livePreview.contract_id === shown.contract_id
      ? livePreview
      : null;

  // Free agency: the season after the last non-void season. Void years
  // hold proration, not the player.
  let lastRealSeason = null;
  shownYears.forEach(function (y) {
    if (!y.is_void_year) {
      if (lastRealSeason === null || y.league_season_year > lastRealSeason) {
        lastRealSeason = y.league_season_year;
      }
    }
  });
  const faYear = lastRealSeason === null ? null : lastRealSeason + 1;

  const currentRow = shownYears.find(function (y) {
    return y.league_season_year === currentSeasonYear && !y.is_void_year;
  });

  // Dead-cap cell: live figure for the current season of the active
  // contract, standing estimate elsewhere. Mirrors the team page.
  function deadCapCell(y) {
    if (y.is_void_year) return '—';
    if (preview && y.league_season_year === currentSeasonYear) {
      const current = formatMoney(preview.dead_cap_current_year);
      const next = n(preview.dead_cap_next_year);
      if (preview.june1_split && next) {
        return current + ' +' + formatMoney(next) + ' next yr';
      }
      return current;
    }
    const est = formatMoney(y.dead_cap_if_cut);
    return est === '—' ? est : est + ' est.';
  }

  // Running sums for the Summary and Cash tables, in season order.
  let running = 0;
  const cashRows = shownYears.map(function (y) {
    const cash = n(y.cash_value) || 0;
    running += cash;
    return { y: y, cumulative: running };
  });
  const cashTotal = running;

  const proseParts = [];
  proseParts.push(
    header.full_name +
      (shown.contract_type === 'rookie' ? ' holds' : ' signed') +
      ' a ' +
      realYears +
      '-year, ' +
      formatMoney(totalCash) +
      ' ' +
      contractTypeLabel(shown.contract_type).toLowerCase() +
      ' contract with ' +
      shown.team_name
  );
  if (signingBonus) {
    proseParts.push(', including a ' + formatMoney(signingBonus) + ' signing bonus');
  }
  if (avgValue !== null) {
    proseParts.push(
      ', with an average annual value of ' + formatMoney(avgValue)
    );
  }
  proseParts.push('.');
  if (isCurrent && currentRow) {
    proseParts.push(
      ' In ' +
        currentSeasonYear +
        ', ' +
        name +
        ' carries a cap hit of ' +
        formatMoney(currentRow.cap_charge) +
        ' and a cash obligation of ' +
        formatMoney(currentRow.cash_value)
    );
    if (preview) {
      proseParts.push(
        '; cutting him today would leave ' +
          formatMoney(preview.dead_cap_current_year) +
          ' in dead cap' +
          (preview.june1_split && n(preview.dead_cap_next_year)
            ? ' this season and ' +
              formatMoney(preview.dead_cap_next_year) +
              ' next'
            : '')
      );
    }
    proseParts.push('.');
  }
  if (!isCurrent) {
    proseParts.push(
      ' This contract ended: ' +
        contractStatusLabel(shown.contract_status).toLowerCase() +
        (shown.ended_at ? ' on ' + formatDate(shown.ended_at) : '') +
        '.'
    );
  }

  return (
    <>
      <p className="pc-prose">{proseParts.join('')}</p>

      <div className="pc-terms">
        <span className="pc-term">
          Contract Terms
          <strong>
            {realYears} yr / {formatMoney(totalCash)}
          </strong>
        </span>
        <span className="pc-term">
          Average Value<strong>{formatMoney(avgValue)}</strong>
        </span>
        <span className="pc-term">
          Signing Bonus<strong>{formatMoney(signingBonus)}</strong>
        </span>
        <span className="pc-term">
          Gtd Salary<strong>{formatMoney(gtdTotal)}</strong>
        </span>
        {faYear !== null && (
          <span className="pc-term">
            Free Agent<strong>{isCurrent ? faYear : '—'}</strong>
          </span>
        )}
        {shown.signed_in_tier && (
          <span className="pc-term">
            Signed In<strong>{shown.signed_in_tier}</strong>
          </span>
        )}
        {shown.draft_year && (
          <span className="pc-term">
            Drafted
            <strong>
              {shown.draft_year}
              {shown.draft_round ? ' · R' + shown.draft_round : ''}
              {shown.draft_pick ? ' · #' + shown.draft_pick : ''}
            </strong>
          </span>
        )}
      </div>

      {!isCurrent && (
        <p className="pc-note">
          Showing {header.full_name}&rsquo;s most recent contract. He holds no
          active EDFL contract.
        </p>
      )}

      <div className="pc-subtabs" role="tablist">
        {SUBTABS.map(function (t) {
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={sub === t.key}
              className={'pc-subtab' + (sub === t.key ? ' is-active' : '')}
              onClick={function () {
                setSub(t.key);
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === SUB_SUMMARY && (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Cap Hit</th>
                <th>Cap % League</th>
                <th>Cash</th>
                <th>Cash Cumulative</th>
                <th>Dead Cap If Cut</th>
              </tr>
            </thead>
            <tbody>
              {cashRows.map(function (r) {
                const y = r.y;
                const capInfo = capByYear[y.league_season_year];
                const capHit = n(y.cap_charge);
                let pct = '—';
                if (capInfo && capInfo.cap && capHit !== null) {
                  pct =
                    ((capHit / capInfo.cap) * 100).toFixed(1) +
                    '%' +
                    (capInfo.provisional ? '*' : '');
                }
                return (
                  <tr key={y.league_season_year}>
                    <th scope="row">
                      {y.league_season_year}
                      {y.is_void_year ? (
                        <span className="void-tag"> VOID</span>
                      ) : null}
                    </th>
                    <td className="num v-cap">{formatMoney(y.cap_charge)}</td>
                    <td className="num">{pct}</td>
                    <td className="num v-cash">{formatMoney(y.cash_value)}</td>
                    <td className="num">{formatMoney(r.cumulative)}</td>
                    <td className="num v-dead">{deadCapCell(y)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sub === SUB_CAP && (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Gtd Salary</th>
                <th>Non-Gtd Salary</th>
                <th>Signing Proration</th>
                <th>Option Proration</th>
                <th>Roster Bonus</th>
                <th>Cap Hit</th>
                <th>Dead Cap If Cut</th>
              </tr>
            </thead>
            <tbody>
              {shownYears.map(function (y) {
                return (
                  <tr key={y.league_season_year}>
                    <th scope="row">
                      {y.league_season_year}
                      {y.is_void_year ? (
                        <span className="void-tag"> VOID</span>
                      ) : null}
                    </th>
                    <td className="num">{formatMoney(y.cap_gtd_salary)}</td>
                    <td className="num">{formatMoney(y.cap_non_gtd_salary)}</td>
                    <td className="num">
                      {formatMoney(y.cap_signing_proration)}
                    </td>
                    <td className="num">
                      {formatMoney(y.cap_option_proration)}
                    </td>
                    <td className="num">{formatMoney(y.cap_roster_bonus)}</td>
                    <td className="num v-cap">{formatMoney(y.cap_charge)}</td>
                    <td className="num v-dead">{deadCapCell(y)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pc-note">
            These five components sum to the cap hit by construction. A
            roster bonus joins the cap on September 2 of its season; until
            then it appears here as $0 while remaining a cash obligation. A
            player on the taxi squad carries no non-guaranteed salary
            against the cap (rule 3.3(c)).
          </p>
        </div>
      )}

      {sub === SUB_CASH && (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Gtd Salary</th>
                <th>Non-Gtd Salary</th>
                <th>Signing Bonus</th>
                <th>Option Bonus</th>
                <th>Roster Bonus</th>
                <th>Cash Total</th>
                <th>Cash Cumulative</th>
                <th>Cash Remaining</th>
              </tr>
            </thead>
            <tbody>
              {cashRows.map(function (r) {
                const y = r.y;
                return (
                  <tr key={y.league_season_year}>
                    <th scope="row">
                      {y.league_season_year}
                      {y.is_void_year ? (
                        <span className="void-tag"> VOID</span>
                      ) : null}
                    </th>
                    <td className="num">{formatMoney(y.cash_gtd_salary)}</td>
                    <td className="num">
                      {formatMoney(y.cash_non_gtd_salary)}
                    </td>
                    <td className="num">
                      {formatMoney(y.cash_signing_bonus)}
                    </td>
                    <td className="num">{formatMoney(y.cash_option_bonus)}</td>
                    <td className="num">{formatMoney(y.cash_roster_bonus)}</td>
                    <td className="num v-cash">{formatMoney(y.cash_value)}</td>
                    <td className="num">{formatMoney(r.cumulative)}</td>
                    <td className="num">
                      {formatMoney(cashTotal - r.cumulative)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sub === SUB_VISUAL && <VisualBreakdown rows={shownYears} />}

      <h2 className="section-heading" style={{ marginTop: 36 }}>
        Contract History
      </h2>
      {contracts.length === 0 ? (
        <p className="empty-note">No contracts on record.</p>
      ) : (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Signed</th>
                <th>Team</th>
                <th>Type</th>
                <th>Terms</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Ended</th>
                <th>Dead Cap</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(function (c) {
                const deadTotal =
                  n(c.dead_cap_current_year) === null &&
                  n(c.dead_cap_next_year) === null
                    ? null
                    : (n(c.dead_cap_current_year) || 0) +
                      (n(c.dead_cap_next_year) || 0);
                return (
                  <tr key={c.contract_id}>
                    <th scope="row">{formatDate(c.created_at)}</th>
                    <td style={{ textAlign: 'left' }}>
                      <a href={'/team/' + c.team_id}>{c.team_name}</a>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      {contractTypeLabel(c.contract_type)}
                    </td>
                    <td className="num">
                      {c.total_years} yr / {contractSpan(c)}
                    </td>
                    <td className="num v-cash">{formatMoney(c.total_cash)}</td>
                    <td style={{ textAlign: 'left' }}>
                      <span
                        className={
                          'status ' +
                          (c.is_current ? 'status-good' : 'status-off')
                        }
                      >
                        {contractStatusLabel(c.contract_status)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      {c.ended_by
                        ? c.ended_by + ' · ' + formatDate(c.ended_at)
                        : '—'}
                    </td>
                    <td className="num v-dead">
                      {deadTotal === null ? '—' : formatMoney(deadTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="pc-note">
        Dead cap on a history row is what the ending of that contract
        actually charged, current and next league year combined. Dead Cap If
        Cut in the season tables shows the live engine figure for the
        current season and the standing before-March-1 estimate (est.) for
        future seasons.
      </p>
    </>
  );
}

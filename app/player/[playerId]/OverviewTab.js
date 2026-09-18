'use client';

import TransactionsTab from './TransactionsTab';
import { formatCost } from '../../../lib/formatMoney';
import { n } from './cardHelpers';

/**
 * THE PLAYER CARD'S OVERVIEW TAB -- new in phase 2D-1.
 *
 * Three blocks: what he costs this season, what he has scored this season, and
 * what has happened to him. It is the glance; Contract is the detail.
 *
 * MONEY HERE FOLLOWS R-12. All three headline figures are things the league
 * TAKES -- a cap charge, a cash charge, a dead-money settlement -- so all three
 * are formatCost and round UP. None of them can read low. The exact figures are
 * one tab away on Contract, which is unchanged and still prints what its views
 * return.
 *
 * WHAT THIS BLOCK DELIBERATELY DOES NOT DO. The approved artboard carried a
 * gold advisory sentence: "He is 20% of your 2026 cap and your largest single
 * charge. Cutting him now costs $412 in dead money -- more than the $296 he is
 * charging." Every figure in that sentence is a ratio or a comparison computed
 * across the viewer's whole roster, and composing it here would be money
 * arithmetic in JavaScript (SR-23) plus a money sentence written in JS, which
 * this project puts in the database precisely so two screens cannot word the
 * same fact differently (the compliance banner's edfl_money_text() is the
 * pattern). If that sentence is wanted, it is a view or a function that
 * composes it, and then this block prints it verbatim. It is not a component
 * change.
 */

// A SCORE IS NOT MONEY. Rendered as the database returned it: no rounding, no
// currency, and no Number() round-trip -- '0.00' through Number() prints "0",
// which reads as "not reported" beside a row that uses a dash for exactly that.
function score(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function weekNote(w) {
  const bits = [];
  if (w.rosterStatus === 'taxi') bits.push('Practice squad');
  else if (w.rosterStatus === 'ir') bits.push('IR');
  else bits.push(w.started ? 'Started' : 'Benched');
  if (!w.isFinal) bits.push('in progress');
  return bits.join(' · ');
}

export default function OverviewTab(props) {
  const header = props.header;
  const season = props.currentSeasonYear;
  const weeks = props.weeks || [];

  const cap = n(header.current_season_cap);
  const cash = n(header.current_season_cash);

  // THE LIVE SETTLEMENT, not the static estimate. team_cut_previews is the
  // dead-money engine; contract_year_computed.dead_cap_if_cut knows nothing
  // about weeks charged or a June 1st split. A player with no active contract
  // has no preview and the cell says so rather than printing zero -- "free to
  // cut" is worse than no answer.
  const deadNow =
    props.livePreview && props.livePreview.dead_cap_current_year !== null
      ? n(props.livePreview.dead_cap_current_year)
      : null;
  const deadNext =
    props.livePreview && props.livePreview.dead_cap_next_year !== null
      ? n(props.livePreview.dead_cap_next_year)
      : null;

  const onARoster = Boolean(header.current_contract_id && header.current_team_id);

  return (
    <div>
      {/* ---- WHAT HE COSTS ---- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">{season}</h2>
        {onARoster ? (
          <>
            <div className="edfl-counts is-wide">
              <div className="edfl-count">
                <div className="edfl-count-label">CAP HIT</div>
                <div className="edfl-count-value v-cap">{formatCost(cap)}</div>
              </div>
              <div className="edfl-count">
                <div className="edfl-count-label">CASH</div>
                <div className="edfl-count-value v-cash">{formatCost(cash)}</div>
              </div>
              <div className="edfl-count">
                <div className="edfl-count-label">IF CUT NOW</div>
                <div className="edfl-count-value v-dead">
                  {deadNow === null ? '—' : formatCost(deadNow)}
                </div>
              </div>
            </div>
            <p className="empty-note">
              {deadNow === null ? (
                <>
                  No live cut settlement is available for this contract. The Contract tab
                  carries the per-season estimate.
                </>
              ) : (
                <>
                  If cut now is the live settlement from the dead-money engine, including
                  any June 1st split
                  {deadNext !== null && deadNext > 0
                    ? ', and a further ' + formatCost(deadNext) + ' lands next season'
                    : ''}
                  . Figures here round so a charge never reads low &mdash; the Contract tab
                  has them exactly.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="empty-note">
            No EDFL contract. This player is a free agent as far as the league is
            concerned, so there is nothing charging a cap this season.
          </p>
        )}
      </div>

      {/* ---- WHAT HE HAS SCORED ---- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">This season</h2>
        {props.weeksError ? (
          <div className="form-error">
            Weekly scores could not be loaded: {props.weeksError}.
          </div>
        ) : weeks.length === 0 ? (
          <p className="empty-note">
            No {season} weeks have been synced for this player yet. The Scoreboard pulls
            them from Sleeper a week at a time.
          </p>
        ) : (
          <div className="edfl-list">
            {weeks.map(function (w) {
              return (
                <div
                  className={'edfl-list-item' + (w.isFinal ? '' : ' is-flag')}
                  key={w.week}
                >
                  <div className="edfl-list-when">WEEK {w.week}</div>
                  <div className="edfl-list-what">
                    <div className="edfl-list-note" style={{ marginTop: 0 }}>
                      {weekNote(w)}
                    </div>
                  </div>
                  <div className="pc-week-score">{score(w.points)}</div>
                </div>
              );
            })}
          </div>
        )}
        {weeks.length > 0 && (
          <p className="empty-note">
            What he scored for an EDFL team in an EDFL week. NFL production by season is on
            the Stats tab &mdash; they answer different questions.
          </p>
        )}
      </div>

      {/* ---- WHAT HAS HAPPENED TO HIM ----
          Was its own tab. The component is unedited; only its home changed. */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">Transactions</h2>
        <TransactionsTab header={header} feed={props.feed} />
      </div>
    </div>
  );
}

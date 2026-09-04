'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../components/PlayerLink';
import { formatExactMoney } from '../../lib/formatMoney';
import { exerciseFifthYearOption, declineFifthYearOption } from './actions';

// THE FIFTH YEAR OPTION BOARD. Rule 5.9.
//
// NOTHING IN THIS FILE COMPUTES MONEY, and nothing decides who may act.
//
// Every figure -- the option value, the tier, the current cap charge -- comes
// out of fifth_year_option_board(). The tier is assigned in the database from
// EDFL Pro Bowl selections; the price is looked up in edfl_tag_values. There is
// no client mirror of either and there must not be one, the same rule that
// keeps compute_cut_charges() and trade_impact() single-implementation.
//
// BUTTONS ARE DRAWN ON can_decide ALONE. That flag is true only when the row is
// eligible, undecided, and on the caller's own roster. It decides what is
// DRAWN; exercise_fifth_year_option() and decline_fifth_year_option() decide
// what HAPPENS, and they refuse a foreign roster by name. Hiding a control
// protects nobody -- a Server Action is a callable endpoint whatever the page
// renders -- so do not read this flag as the security boundary.
//
// formatExactMoney, NOT formatMoney. Option values are whole dollars by
// construction, so a fraction on one would be a defect and rounding would hide
// it. current_cap_charge comes from contract_year_computed and may legitimately
// carry inherited signing-bonus proration from before the whole-dollar rule --
// rule 1.9, still open. Rounding that to tidy it would put this page out of
// step with the team Overview grid, which shows the same values exactly.

// The tier vocabulary. Labels and reasons only -- the tier itself is assigned
// in the database and is never derived here. An unrecognised tier falls through
// to its raw value rather than being dropped, the same principle as
// lib/tierRows.js: a tier nobody mapped should look odd on screen, not vanish.
const TIER_LABEL = {
  4: 'Tier 4 · Franchise',
  3: 'Tier 3 · Transition',
  2: 'Tier 2 · Playing time',
  1: 'Tier 1 · Base',
};

const TIER_WHY = {
  4: 'two or more EDFL Pro Bowls in his first three seasons',
  3: 'exactly one EDFL Pro Bowl in his first three seasons',
  2: 'no Pro Bowl, but a starter-level finish in two of three seasons',
  1: 'no Pro Bowl and no qualifying playing-time seasons',
};

function tierLabel(t) {
  if (t === null || t === undefined) return '—';
  return TIER_LABEL[t] || 'Tier ' + t;
}

function tierWhy(t) {
  return TIER_WHY[t] || null;
}

export default function FifthYearOptionBoard({ board }) {
  const data = board || {};
  const rows = data.rows || [];
  const optionSeason = data.option_season;
  const season = data.season;

  // { row, action } -- the row awaiting confirmation, null when no dialog.
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [working, startTransition] = useTransition();
  const router = useRouter();

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) {
          setPending(null);
          setNote('');
          setError('');
        }
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    },
    [working]
  );

  function ask(row, action) {
    setNote('');
    setError('');
    setDone(null);
    setPending({ row, action });
  }

  function cancel() {
    setPending(null);
    setNote('');
    setError('');
  }

  function confirm() {
    if (!pending) return;
    const row = pending.row;
    const action = pending.action;

    startTransition(async function () {
      let res;
      try {
        res =
          action === 'exercise'
            ? await exerciseFifthYearOption(row.contract_id, note)
            : await declineFifthYearOption(row.contract_id, note);
      } catch (e) {
        // A genuine transport failure. The database's own refusals arrive as
        // values on res, never here (ground rule 9).
        setError('The request did not reach the server. Nothing was changed.');
        return;
      }

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setPending(null);
      setNote('');
      setDone({ action, player: row.player_name });
      router.refresh();
    });
  }

  const mine = rows.filter(function (r) {
    return r.is_my_team;
  });
  const awaiting = mine.filter(function (r) {
    return r.can_decide;
  });

  if (rows.length === 0) {
    return (
      <p className="empty-note">
        No option decisions are open. A Round 1 rookie reaches his option in the fourth
        season of his contract.
      </p>
    );
  }

  return (
    <>
      <p className="empty-note">
        {awaiting.length === 0
          ? 'You have no option decisions awaiting you.'
          : awaiting.length === 1
            ? 'One option decision is awaiting you.'
            : awaiting.length + ' option decisions are awaiting you.'}{' '}
        Decisions are for the {optionSeason} season. There is no deadline set &mdash; the
        board stays open until the commissioner sets one.
      </p>

      {done && (
        <div className="form-notice">
          {done.action === 'exercise'
            ? done.player + ' is signed for ' + optionSeason + ', fully guaranteed.'
            : done.player +
              '’s option is declined. His contract ends after this season and is eligible for restructure straight away.'}
        </div>
      )}

      {error && !pending && <div className="form-error">{error}</div>}

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Team</th>
              <th className="col-num">Pro Bowls</th>
              <th>Tier</th>
              <th className="col-num">{season} Cap</th>
              <th className="col-num">{optionSeason} Option</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              const decided = row.decision && row.decision.outcome;
              const why = tierWhy(row.tier);
              return (
                <tr key={row.contract_id}>
                  <td className="team-name" data-label="Player">
                    <PlayerLink playerId={row.player_id}>{row.player_name}</PlayerLink>
                    {row.is_my_team && <span className="status status-live">YOUR TEAM</span>}
                  </td>
                  <td data-label="Pos">{row.position}</td>
                  <td data-label="Team">{row.team_name}</td>
                  <td className="num col-num" data-label="Pro Bowls">
                    {row.pro_bowls}
                  </td>
                  <td data-label="Tier">
                    <span title={why || undefined}>{tierLabel(row.tier)}</span>
                  </td>
                  <td className="num v-cap col-num" data-label={season + ' Cap'}>
                    {formatExactMoney(row.current_cap_charge)}
                  </td>
                  <td className="num v-cap col-num" data-label={optionSeason + ' Option'}>
                    {formatExactMoney(row.option_value)}
                  </td>
                  <td data-label="Decision">
                    {decided === 'exercised' && (
                      <span className="status status-good">EXERCISED</span>
                    )}
                    {decided === 'declined' && <span className="status status-off">DECLINED</span>}

                    {/*
                      Not decided, and not actionable by this viewer. Two
                      different answers and they must stay different: a row that
                      is ineligible says WHY, a row that is simply somebody
                      else's says nothing at all. Collapsing both into
                      "Undecided" is what the restructure picker was corrected
                      for -- an eligibility refusal and a permission refusal are
                      not the same fact.
                    */}
                    {!decided && row.can_decide && (
                      <span className="page-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={working}
                          onClick={function () {
                            ask(row, 'exercise');
                          }}
                        >
                          Exercise
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          disabled={working}
                          onClick={function () {
                            ask(row, 'decline');
                          }}
                        >
                          Decline
                        </button>
                      </span>
                    )}
                    {!decided && !row.can_decide && !row.eligible && (
                      <span className="empty-note">
                        {row.ineligible_reason || 'Not eligible'}
                      </span>
                    )}
                    {!decided && !row.can_decide && row.eligible && (
                      <span className="empty-note">Undecided</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="legend">
        <h2 className="section-heading">How the price is set</h2>
        <p>
          Tier comes from EDFL Pro Bowl selections in the player&rsquo;s first three seasons.
          The price is the {optionSeason} value for that tier at his position: Tier 4 is the
          franchise figure, Tier 3 the transition figure, Tier 2 and Tier 1 the playing-time
          and base figures. Exercising writes a new one-year contract for {optionSeason},
          fully guaranteed, alongside the rookie deal that still covers this season.
        </p>
        <p>
          Declining ends the contract after this season and makes it eligible for restructure
          immediately. Either decision can be reversed by the commissioner within 96 hours
          &mdash; ask him if you need one undone.
        </p>
        <p className="empty-note">
          Nothing here moves a Sleeper roster. An exercised option has to be reflected there
          by hand.
        </p>
      </section>

      {pending && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true">
            <h2 className="modal-title">
              {pending.action === 'exercise'
                ? 'Exercise the option on '
                : 'Decline the option on '}
              <PlayerLink playerId={pending.row.player_id}>
                {pending.row.player_name}
              </PlayerLink>
              ?
            </h2>

            <div className="modal-section">
              <p className="empty-note">
                {pending.row.position} &middot; {pending.row.team_name}
              </p>
            </div>

            <div className="modal-section">
              {pending.action === 'exercise' ? (
                <>
                  <p>
                    Adds a <strong>{optionSeason}</strong> season at{' '}
                    <strong className="v-cap">
                      {formatExactMoney(pending.row.option_value)}
                    </strong>
                    , <strong>fully guaranteed</strong>. If he is cut in {optionSeason} the
                    whole figure stays on the cap.
                  </p>
                  {tierWhy(pending.row.tier) && (
                    <p className="empty-note">
                      Priced at {tierLabel(pending.row.tier)} because he has{' '}
                      {tierWhy(pending.row.tier)}.
                    </p>
                  )}
                  <p className="empty-note">
                    This season&rsquo;s contract is untouched. The option is a separate
                    one-year deal beginning in {optionSeason}.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    His contract <strong>ends after this season</strong>. He will not be on
                    the {optionSeason} roster, and the right to that season at{' '}
                    <strong className="v-cap">
                      {formatExactMoney(pending.row.option_value)}
                    </strong>{' '}
                    is given up.
                  </p>
                  <p className="empty-note">
                    His current contract becomes eligible for restructure straight away.
                  </p>
                </>
              )}
            </div>

            <div className="modal-section">
              <label>
                Note (optional, shown on his player card)
                <input
                  type="text"
                  value={note}
                  maxLength={200}
                  disabled={working}
                  onChange={function (e) {
                    setNote(e.target.value);
                  }}
                />
              </label>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={cancel}
                disabled={working}
              >
                Go back
              </button>
              <button
                type="button"
                className={pending.action === 'exercise' ? 'btn' : 'btn btn-danger'}
                onClick={confirm}
                disabled={working}
              >
                {working
                  ? 'Working…'
                  : pending.action === 'exercise'
                    ? 'Exercise at ' + formatExactMoney(pending.row.option_value)
                    : 'Decline the option'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

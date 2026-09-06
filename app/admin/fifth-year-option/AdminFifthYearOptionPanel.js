'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import { formatExactMoney } from '../../../lib/formatMoney';
import { formatShortDateTime } from '../../../lib/formatDate';
import { reverseFifthYearOption } from '../../fifth-year-option/actions';

// FIFTH YEAR OPTION REVERSAL. The commissioner's control, and the only caller
// of reverseFifthYearOption.
//
// NO JS MIRRORS THE GUARDS, and there is deliberately no is_reversible flag
// read here. reverse_fifth_year_option() owns the officer check and the
// 96-hour window, and it refuses with a sentence naming the reason. So Reverse
// is offered on every decided row and the database says no when the answer is
// no -- the same choice RosterMoveDialog makes, for the same reason: a client
// pre-check would be a second copy of a rule the database owns, and the
// database would win every time they disagreed.
//
// THE WINDOW IS NOT COUNTED DOWN ON SCREEN. /admin/cuts can show "3.2h left"
// because cut_history returns reversal_hours_left; the option board returns no
// equivalent, and deriving one from decided_at would mean hardcoding 96 hours
// in JavaScript. The window lives in league_config and is read, never
// hardcoded -- so the page states that a window exists and lets the refusal
// name it when it has closed.
//
// A REASON IS REQUIRED and reaches the public action log, matching the cut and
// trade reversal dialogs.
export default function AdminFifthYearOptionPanel({ rows, optionSeason }) {
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [working, startTransition] = useTransition();
  const router = useRouter();

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) {
          setTarget(null);
          setReason('');
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

  function close() {
    setTarget(null);
    setReason('');
    setError('');
  }

  function submit() {
    if (!target) return;
    const row = target;

    startTransition(async function () {
      let res;
      try {
        res = await reverseFifthYearOption(row.decision.event_id, reason);
      } catch (e) {
        setError('The request did not reach the server. Nothing was changed.');
        return;
      }

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setTarget(null);
      setReason('');
      setDone(
        row.player_name +
          '’s option decision is reversed. The decision is open again on the option board.'
      );
      router.refresh();
    });
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="empty-note">
        No option decision has been made yet. Once an owner exercises or declines, it appears
        here and can be reversed inside the window.
      </p>
    );
  }

  return (
    <>
      {done && <div className="form-notice">{done}</div>}
      {error && !target && <div className="form-error">{error}</div>}

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Decision</th>
              <th>When</th>
              <th className="col-num">{optionSeason} Option</th>
              <th>Note</th>
              <th>Reverse</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              const d = row.decision;
              return (
                <tr key={d.event_id}>
                  <td className="team-name" data-label="Player">
                    <PlayerLink playerId={row.player_id}>{row.player_name}</PlayerLink>
                  </td>
                  <td data-label="Team">{row.team_name}</td>
                  <td data-label="Decision">
                    {d.outcome === 'exercised' ? (
                      <span className="status status-good">EXERCISED</span>
                    ) : (
                      <span className="status status-off">DECLINED</span>
                    )}
                  </td>
                  <td data-label="When">{formatShortDateTime(d.decided_at)}</td>
                  <td className="num v-cap col-num" data-label={optionSeason + ' Option'}>
                    {formatExactMoney(row.option_value)}
                  </td>
                  <td data-label="Note">
                    {d.note ? d.note : <span className="empty-note">&mdash;</span>}
                  </td>
                  <td data-label="Reverse">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={working}
                      onClick={function () {
                        setTarget(row);
                        setReason('');
                        setError('');
                        setDone('');
                      }}
                    >
                      Reverse
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="empty-note">
        A decision can be reversed for a limited window after it is made. The exact window is
        held in league configuration and enforced by the database — if it has closed, or if the
        decision is not yours to reverse, the refusal will say so.
      </p>

      {target && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={'Reverse the option decision for ' + target.player_name}
          >
            <h2 className="modal-title">
              Reverse:{' '}
              <PlayerLink playerId={target.player_id}>{target.player_name}</PlayerLink>
            </h2>
            <p className="empty-note">
              {target.team_name} &middot; {target.decision.outcome}{' '}
              {formatShortDateTime(target.decision.decided_at)}
            </p>

            <div className="modal-section">
              <p className="form-notice">
                {target.decision.outcome === 'exercised'
                  ? 'This removes the ' +
                    optionSeason +
                    ' option contract and puts the decision back to the owner. The rookie contract covering this season is not affected.'
                  : 'This undoes the decline and puts the decision back to the owner. The contract stops being eligible for restructure again while it is outstanding.'}
              </p>
              <p className="empty-note">
                Nothing here moves a Sleeper roster. If the option was already reflected there,
                it has to be undone by hand.
              </p>
            </div>

            <div className="modal-section">
              <label htmlFor="fyo-reason">
                Reason (required, appears in the public action log)
              </label>
              <input
                id="fyo-reason"
                type="text"
                value={reason}
                maxLength={200}
                disabled={working}
                onChange={function (e) {
                  setReason(e.target.value);
                }}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={close}
                disabled={working}
              >
                Go back
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={submit}
                disabled={working || !reason.trim()}
              >
                {working ? 'Working…' : 'Reverse the decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

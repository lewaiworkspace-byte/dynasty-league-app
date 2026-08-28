'use client';

import { useEffect, useState } from 'react';
import { reverseTrade } from '../actions';
import { formatMoney } from '../../../lib/formatMoney';

// NOTHING IN THIS FILE DECIDES WHETHER A REVERSAL IS ALLOWED.
//
// reverse_trade() holds five guards in a deliberate order -- current season,
// players untouched since, no auction verified since, picks unspent and
// unmoved, window still open -- and each refuses with a sentence naming the
// reason. Those sentences are rendered verbatim. A client mirror of any of
// them would be a second copy of a rule the database owns, which is the same
// reason RosterMoveDialog offers every destination and lets the database say
// no.
//
// THE ONE THING THIS FILE DOES DECIDE is which refusals are worth offering to
// override, and it does that from the SQLSTATE rather than the wording.
// reverse_trade() raises EDFL1 for a compliance breach and P0001 for
// everything else, because p_force bypasses the compliance check and nothing
// else. Offering "reverse anyway" after a closed window would be a lie: the
// forced call would refuse identically. So the override only ever appears
// when the action comes back with needsForce, and it is worded and confirmed
// separately from the ordinary path so that forcing can never be reached by
// pressing the same button one more time.

// A breach amount is money for a cap or cash breach and a HEADCOUNT for a
// roster one. Running a roster breach through formatMoney would print "$26"
// for twenty-six players, so the formatter is applied by kind rather than to
// every number in the list.
//
// An unrecognised kind falls through to the plain number rather than being
// guessed at -- same principle as the unrecognised-status fallback in
// lib/tradeStatus.js. A new breach kind added database-side should render
// unformatted, not wrongly formatted as currency.
function breachAmount(kind, n) {
  if (kind === 'cap' || kind === 'cash') return formatMoney(n);
  return String(n);
}

export default function ReverseTradeDialog(props) {
  const tradeId = props.tradeId;
  const hoursLeft = props.hoursLeft;
  const onClose = props.onClose;
  const onDone = props.onDone;

  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const [forceConfirming, setForceConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) onClose();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    },
    [onClose, working]
  );

  function attempt(force) {
    setWorking(true);
    setError('');
    reverseTrade(tradeId, reason, force)
      .then(function (r) {
        if (!r.ok) {
          setError(r.message);
          // Both confirmations drop on any refusal, so a second press has to
          // be deliberate rather than landing on a prompt raised for the
          // previous attempt.
          setConfirming(false);
          setForceConfirming(false);
          if (r.needsForce) setNeedsForce(true);
          return;
        }
        setResult(r.data);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirming(false);
        setForceConfirming(false);
      })
      .finally(function () {
        setWorking(false);
      });
  }

  function handleReverse() {
    if (reason.trim().length < 10) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    attempt(false);
  }

  function handleForce() {
    if (reason.trim().length < 10) return;
    if (!forceConfirming) {
      setForceConfirming(true);
      return;
    }
    attempt(true);
  }

  const breaches = result && Array.isArray(result.breaches) ? result.breaches : [];

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true">
        <h2 className="modal-title">Reverse this trade</h2>

        {result ? (
          <>
            <div className="modal-section">
              <p>
                <strong>Reversed.</strong> {String(result.players_returned)} player(s) and{' '}
                {String(result.picks_returned)} pick(s) went back to the teams that sent them.
              </p>
              <p className="empty-note">
                Each player is on his original contract again, and the settlement that moved his
                money is marked reversed rather than deleted &mdash; both teams&apos; cap and cash
                read as they did before the trade. The trade stays on the public record marked
                reversed.
              </p>
            </div>

            {result.forced && (
              <div className="modal-section">
                <div className="form-error">
                  <p>
                    <strong>This reversal was forced over a compliance breach.</strong>
                  </p>
                  <ul>
                    {breaches.map(function (b, i) {
                      return (
                        <li key={'b' + i}>
                          {b.team}: {b.kind} is {breachAmount(b.kind, b.value)} against a limit
                          of {breachAmount(b.kind, b.limit)}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="empty-note">
                    The breach is recorded in the Commissioner Action Log and is now a rule 3.6(a)
                    compliance matter for the team named. It does not resolve itself.
                  </p>
                </div>
              </div>
            )}

            <div className="modal-section">
              <p className="empty-note">
                <strong>Sleeper was not touched.</strong> Nothing in this app can change a Sleeper
                roster. If the players were already moved there, move them back by hand.
              </p>
            </div>

            <div className="page-actions">
              <button
                type="button"
                className="btn"
                onClick={function () { onDone(result); }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-section">
              <p className="empty-note">
                Reversing undoes an executed trade completely: every player returns to the roster
                that sent him on his original contract, every pick goes back, and the dead money
                the trade created is cleared from the giving team. The trade is not deleted
                &mdash; it stays visible, marked reversed, with your reason attached.
              </p>
              {hoursLeft != null && hoursLeft > 0 && (
                <p className="empty-note">
                  About <strong>{String(Math.max(1, Math.floor(hoursLeft)))}</strong> hour(s) left
                  in the reversal window. After it closes, correcting this trade is a deliberate
                  commissioner action rather than a reversal.
                </p>
              )}
              {hoursLeft != null && hoursLeft <= 0 && (
                <p className="empty-note">
                  The reversal window appears to have closed. You can still try &mdash; the
                  database has the authoritative answer and will say so plainly.
                </p>
              )}
            </div>

            <div className="modal-section">
              <label>
                Reason (at least 10 characters). This is published in the Commissioner Action Log.
                <input
                  type="text"
                  value={reason}
                  onChange={function (e) {
                    setReason(e.target.value);
                    setConfirming(false);
                    setForceConfirming(false);
                  }}
                  disabled={working}
                />
              </label>
            </div>

            {error && <div className="form-error">{error}</div>}

            {needsForce && (
              <div className="modal-section">
                <p className="empty-note">
                  A reversal restores the state as it was before the trade, and that state is no
                  longer legal for the team named above &mdash; something has changed since. You
                  can reverse anyway. The breach is recorded against that team and becomes a rule
                  3.6(a) compliance matter, which you will then have to resolve.
                </p>
                <div className="page-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleForce}
                    disabled={working || reason.trim().length < 10}
                  >
                    {working
                      ? 'Working…'
                      : forceConfirming
                        ? 'Confirm: reverse over the breach'
                        : 'Reverse anyway, accepting the breach'}
                  </button>
                </div>
              </div>
            )}

            {confirming && !needsForce && (
              <p className="empty-note">
                Reverse this trade? Press again to confirm.
              </p>
            )}

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={onClose}
                disabled={working}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleReverse}
                disabled={working || reason.trim().length < 10}
              >
                {working ? 'Reversing…' : confirming ? 'Confirm reversal' : 'Reverse trade'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

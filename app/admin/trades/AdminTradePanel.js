'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { executeTrade, vetoTrade } from '../../trades/actions';
import ReverseTradeDialog from '../../trades/[tradeId]/ReverseTradeDialog';

// THE THREE COMMISSIONER CONTROLS, AND THEY ARE NOT GATED THE SAME WAY.
//
//   Approve & execute -- commissioner OR co-commissioner (7.7(c))
//   Veto              -- COMMISSIONER ONLY (7.7(d), "the commissioner and
//                        commissioner only")
//   Reverse           -- commissioner may reverse any trade including his own
//                        team's; a co-commissioner may not reverse one their
//                        team is party to (reversal ruling, August 27)
//
// Three adjacent buttons, three different rules. Never widen the veto to match
// the button beside it, and never narrow the reversal to match the approval --
// they look inconsistent and are not. The Server Actions re-check every one of
// these independently, because rendering is not a gate.
//
// The actions are imported from app/trades/actions.js rather than duplicated.
// executeTrade and vetoTrade already carry the right gates; moving the buttons
// to the Admin section changed where they are drawn, not who may press them.

const ACTION_NONE = '';
const ACTION_VETO = 'veto';

export default function AdminTradePanel(props) {
  const { tradeId, status, conflicted, isCommissioner, canReverse, hoursLeft, myTeamName } = props;

  const router = useRouter();

  const [pending, setPending] = useState(ACTION_NONE);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reverseOpen, setReverseOpen] = useState(false);

  function run(promise, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    promise
      .then(function (result) {
        if (!result.ok) {
          // Verbatim. These refusals name the rule they enforce.
          setError(result.message);
          setConfirming(false);
          return;
        }
        setNotice(successMessage);
        setPending(ACTION_NONE);
        setReason('');
        setConfirming(false);
        router.refresh();
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirming(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function handleExecute() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    run(executeTrade(tradeId), 'Executed. The players and picks have moved.');
  }

  function handleVeto() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    run(vetoTrade(tradeId, reason), 'Vetoed under rule 7.7(d).');
  }

  const showApproval = status === 'accepted' && !conflicted;
  const showVeto = isCommissioner && status === 'accepted';

  return (
    <div className="trade-actions">
      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-notice">{notice}</div>}

      {/*
        RECUSAL IS EXPLAINED, NOT JUST ENFORCED. execute_trade() would refuse
        under 7.7(e); saying so here means the commissioner is not left pressing
        a button that cannot work.
      */}
      {conflicted && status === 'accepted' && (
        <div className="form-notice">
          <strong>You must recuse yourself.</strong> {myTeamName} is a party to this trade, so
          under rule 7.7(e) you cannot approve it. Approval has to come from a co-commissioner or
          an alternate approver. If nobody else holds that role yet, appointing a co-commissioner
          on <a href="/admin/owner-activity">Owner Administration</a> is what unblocks it.
        </div>
      )}

      {showApproval && pending === ACTION_NONE && (
        <div className="action-bar">
          <button type="button" className="btn" onClick={handleExecute} disabled={busy}>
            {busy ? 'Working…' : confirming ? 'Press again to execute' : 'Approve and execute'}
          </button>
          {confirming && (
            <p className="empty-note">
              This moves the players and picks immediately. The database re-checks legality and
              post-trade cap and cash compliance first, and refuses if anything fails.
            </p>
          )}
        </div>
      )}

      {showVeto && (
        <div className="trade-confirm" style={{ marginTop: 12 }}>
          {pending !== ACTION_VETO ? (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={function () {
                setPending(ACTION_VETO);
                setConfirming(false);
                setError('');
              }}
              disabled={busy}
            >
              Veto this trade
            </button>
          ) : (
            <>
              <p className="empty-note">
                Rule 7.7(d), competitive balance. Commissioner only — a co-commissioner cannot
                veto. The reason is logged and is appealable through the grievance process, so
                write it for the owners who will read it.
              </p>
              <label>
                Reason (at least 10 characters)
                <input
                  type="text"
                  value={reason}
                  onChange={function (e) { setReason(e.target.value); }}
                  disabled={busy}
                />
              </label>
              <div className="action-bar">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleVeto}
                  disabled={busy || reason.trim().length < 10}
                >
                  {busy ? 'Working…' : confirming ? 'Press again to veto' : 'Veto trade'}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={function () {
                    setPending(ACTION_NONE);
                    setReason('');
                    setConfirming(false);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {canReverse && (
        <div className="trade-confirm" style={{ marginTop: 12 }}>
          <p className="empty-note">
            Reversing undoes this trade completely: every player goes back to the roster that
            sent him on his original contract, every pick goes back, and the cap and cash the
            trade moved are returned to where they were.
            {hoursLeft !== null && hoursLeft !== undefined && hoursLeft > 0
              ? ' About ' + String(Math.max(1, Math.floor(hoursLeft))) + ' hour(s) left in the reversal window.'
              : ''}
            {hoursLeft !== null && hoursLeft !== undefined && hoursLeft <= 0
              ? ' The reversal window appears to have closed — the database has the authoritative answer.'
              : ''}
          </p>
          <div className="action-bar">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={function () { setReverseOpen(true); }}
              disabled={busy}
            >
              Reverse this trade
            </button>
          </div>
        </div>
      )}

      {reverseOpen && (
        <ReverseTradeDialog
          tradeId={tradeId}
          hoursLeft={hoursLeft}
          onClose={function () { setReverseOpen(false); }}
          onDone={function () {
            setReverseOpen(false);
            setNotice(
              'Reversed. Every player and pick went back, and neither team is carrying cap or cash from this trade.'
            );
            router.refresh();
          }}
        />
      )}

      {!showApproval && !showVeto && !canReverse && !conflicted && (
        <p className="empty-note">Nothing to do on this one.</p>
      )}
    </div>
  );
}

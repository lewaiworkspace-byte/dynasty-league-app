'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptTrade, declineTrade, executeTrade, vetoTrade, submitTrade } from '../actions';
import DiscardDraftButton from '../DiscardDraftButton';

// CONTROLS BY ROLE, AND TWO OF THE GATES ARE DIFFERENT WIDTHS.
//
//   Accept / Decline  -> a party who has not yet answered
//   Approve & execute -> commissioner OR co-commissioner (rule 7.7(c))
//   Veto              -> COMMISSIONER ONLY (rule 7.7(d))
//
// The last two sit side by side and are NOT gated the same way. 7.7(c) shares
// approval with the co-commissioner; 7.7(d) reserves the veto to "the
// commissioner and commissioner only". Do not widen the veto to match the
// button beside it -- that is the whole reason both flags are passed in
// separately instead of one canApprove. The Server Actions re-check both
// independently, because rendering is not a gate.
//
// Every action RETURNS its refusal. The .catch arms below are for a dead
// network only. If a refusal ever appears in one, an action started throwing.

const ACTION_NONE = '';
const ACTION_DECLINE = 'decline';
const ACTION_EXECUTE = 'execute';
const ACTION_VETO = 'veto';

export default function TradePanel(props) {
  const {
    tradeId,
    status,
    isParty,
    isProposer,
    hasAccepted,
    hasDeclined,
    canApprove,
    isCommissioner,
    approverIsConflicted,
    stalledOnRecusal,
    isFinal,
    myTeamName,
  } = props;

  const router = useRouter();

  const [pending, setPending] = useState(ACTION_NONE);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function reset() {
    setPending(ACTION_NONE);
    setReason('');
    setConfirming(false);
  }

  function begin(action) {
    setPending(action);
    setReason('');
    setConfirming(false);
    setError('');
    setNotice('');
  }

  function run(promise, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    promise
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          // Drop the confirmation so a second press has to be deliberate
          // rather than landing on a prompt raised for the previous attempt.
          setConfirming(false);
          return;
        }
        setNotice(successMessage);
        reset();
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirming(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function handleAccept() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    run(
      acceptTrade(tradeId),
      'Accepted. If you were the last party, the figures are now frozen.'
    );
  }

  function handleConfirmWithReason(action) {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (action === ACTION_DECLINE) {
      run(declineTrade(tradeId, reason), 'Declined. The other owners can see your reason.');
    } else if (action === ACTION_VETO) {
      run(vetoTrade(tradeId, reason), 'Vetoed under rule 7.7(d).');
    }
  }

  function handleExecute() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    run(executeTrade(tradeId), 'Executed. The players and picks have moved.');
  }

  // WHAT EACH VIEWER MAY DO, BY STATUS.
  //
  // The bug this replaces: the party block carried a status !== 'draft' test and
  // there was no proposer branch at all, so a draft matched nothing and fell
  // through to the read-only footer -- telling the owner who built it that
  // only its parties could act on it. RLS means the proposer is the ONLY
  // person who can see a draft, so that footer could never have been right.
  //
  //   draft     proposer -> Send, Discard        (nobody else can see it)
  //   proposed  party    -> Accept if not yet answered; Decline either way.
  //                         The proposer auto-accepted at submit, so they get
  //                         Decline alone -- which is correct, not a bug.
  //             commissioner -> Veto (7.7(d), commissioner only)
  //   accepted  commissioner/co -> Execute (7.7(c)); Veto stays commissioner-only
  //   final     nobody
  const showDraftControls = isProposer && status === 'draft';
  const canAccept = isParty && status === 'proposed' && !hasAccepted && !hasDeclined;
  const canDecline = isParty && status === 'proposed' && !hasDeclined;
  const showPartyControls = !isFinal && (canAccept || canDecline);
  const showApproval = canApprove && status === 'accepted';
  const showVeto = isCommissioner && (status === 'proposed' || status === 'accepted');

  function handleSend() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    submitTrade(tradeId)
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          setConfirming(false);
          return;
        }
        setNotice('Sent. Every party can see it now, and your acceptance is recorded.');
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

  return (
    <section className="trade-actions" style={{ marginTop: 28 }}>
      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-notice">{notice}</div>}

      {/*
        The recusal explanation, shown to whoever is looking. An approver whose
        own team is a party gets the specific version; anyone else waiting on a
        stalled trade gets the accurate general one. See the RLS note in
        page.js for why a party is not told which team is conflicted.
      */}
      {approverIsConflicted && status === 'accepted' && (
        <div className="form-notice">
          <strong>You must recuse yourself.</strong> {myTeamName} is a party to this trade,
          so under rule 7.7(e) you cannot approve it. Approval has to come from a
          co-commissioner or an alternate approver. If nobody else holds that role yet,
          appointing a co-commissioner on{' '}
          <a href="/admin/owner-activity">Owner Administration</a> is what unblocks it.
        </div>
      )}
      {stalledOnRecusal && !approverIsConflicted && !canApprove && (
        <p className="empty-note">
          Every party has accepted. This trade is waiting on a commissioner or
          co-commissioner who is not a party to it — rule 7.7(e) requires anyone whose own
          team is involved to recuse.
        </p>
      )}

      {showDraftControls && (
        <div className="action-bar">
          <button type="button" className="btn" onClick={handleSend} disabled={busy}>
            {busy ? 'Working…' : confirming ? 'Press again to send' : 'Send to the other owners'}
          </button>
          <DiscardDraftButton tradeId={tradeId} redirectTo="/trades" />
          {confirming && !busy && (
            <p className="empty-note">
              Sending makes this trade visible to every owner and counts as your acceptance.
              The players and picks in it are checked again at that moment — if another trade
              has taken one since you built this, you will be told to rebuild.
            </p>
          )}
        </div>
      )}

      {showPartyControls && (
        <div className="action-bar">
          {pending === ACTION_NONE && (
            <>
              {canAccept && (
                <button type="button" className="btn" onClick={handleAccept} disabled={busy}>
                  {busy ? 'Working…' : confirming ? 'Press again to accept' : 'Accept'}
                </button>
              )}
              {canDecline && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={function () { begin(ACTION_DECLINE); }}
                  disabled={busy}
                >
                  Decline
                </button>
              )}
            </>
          )}

          {confirming && pending === ACTION_NONE && canAccept && (
            <p className="empty-note">
              Accepting is binding. If you are the last party to accept, the cap and cash
              figures above freeze at that moment and the trade goes to the commissioner.
            </p>
          )}

          {pending === ACTION_DECLINE && (
            <div className="trade-confirm">
              <label>
                Why are you declining? The other owners will see this.
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
                  onClick={function () { handleConfirmWithReason(ACTION_DECLINE); }}
                  disabled={busy || !reason.trim()}
                >
                  {busy ? 'Working…' : confirming ? 'Press again to decline' : 'Decline trade'}
                </button>
                <button type="button" className="btn btn-quiet" onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showApproval && !approverIsConflicted && (
        <div className="action-bar">
          <button type="button" className="btn" onClick={handleExecute} disabled={busy}>
            {busy ? 'Working…' : confirming ? 'Press again to execute' : 'Approve and execute'}
          </button>
          {confirming && (
            <p className="empty-note">
              This moves the players and picks immediately. The database re-checks legality
              and post-trade cap and cash compliance first, and refuses if anything fails.
            </p>
          )}
        </div>
      )}

      {showVeto && (
        <div className="trade-confirm" style={{ marginTop: 16 }}>
          {pending !== ACTION_VETO ? (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={function () { begin(ACTION_VETO); }}
              disabled={busy}
            >
              Veto this trade
            </button>
          ) : (
            <>
              <p className="empty-note">
                Rule 7.7(d), competitive balance. Commissioner only — a co-commissioner
                cannot veto. The reason is logged and is appealable through the grievance
                process, so write it for the owners who will read it.
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
                  onClick={function () { handleConfirmWithReason(ACTION_VETO); }}
                  disabled={busy || reason.trim().length < 10}
                >
                  {busy ? 'Working…' : confirming ? 'Press again to veto' : 'Veto trade'}
                </button>
                <button type="button" className="btn btn-quiet" onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/*
        THE READ-ONLY FOOTER APPEARS ONLY WHEN THE VIEWER GENUINELY HAS NO
        ACTION. showDraftControls is part of this condition -- leaving it out is
        what put this sentence under a proposer's own draft.
      */}
      {!showDraftControls &&
        !showPartyControls &&
        !showApproval &&
        !showVeto &&
        !stalledOnRecusal && (
          <p className="empty-note">
            {isFinal
              ? 'This trade is finished. Nothing further can be done to it.'
              : hasDeclined
                ? 'You declined this trade.'
                : isParty && hasAccepted
                  ? 'You have accepted this trade. It is waiting on the other parties or on the commissioner.'
                  : 'You are reading this trade. Only its parties and the commissioner can act on it.'}
          </p>
        )}
    </section>
  );
}

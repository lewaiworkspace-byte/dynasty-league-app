'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptTrade, declineTrade, submitTrade } from '../actions';
import DiscardDraftButton from '../DiscardDraftButton';

// PARTY CONTROLS ONLY. This panel is what an OWNER does with a trade:
//
//   draft     proposer -> Send, Discard
//   proposed  party    -> Accept if not yet answered; Decline either way
//
// APPROVE, VETO AND REVERSE ARE NOT HERE ANY MORE (Sep 4 2026). They moved to
// /admin/trades, because a League surface treats the commissioner as an
// ordinary owner and those three are administrative acts. Do not add them
// back: this page is read by every owner, and an admin control sitting on it
// is reachable by accident -- which is how a commissioner restructured another
// team's contract without meaning to.
//
// Every action RETURNS its refusal. The .catch arms below are for a dead
// network only. If a refusal ever appears in one, an action started throwing.

const ACTION_NONE = '';
const ACTION_DECLINE = 'decline';

export default function TradePanel(props) {
  const {
    tradeId,
    status,
    isParty,
    isProposer,
    hasAccepted,
    hasDeclined,
    stalledOnRecusal,
    isFinal,
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

  // successMessage may be a string or a function of the RPC's returned data,
  // for the one action whose outcome the owner needs spelled out (accept).
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
        setNotice(
          typeof successMessage === 'function' ? successMessage(result.data) : successMessage
        );
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
    run(acceptTrade(tradeId), function (data) {
      // accept_trade() reports how many competing offers it cancelled. That
      // number is only ever non-zero on the LAST acceptance (ruling of
      // September 3, 2026: full acceptance invalidates every other open offer
      // naming any of the same players or picks), so it doubles as the tell
      // that this press was the one that froze the figures.
      var cancelled = data && data.offers_cancelled ? Number(data.offers_cancelled) : 0;
      var msg = 'Accepted. If you were the last party, the figures are now frozen.';
      if (cancelled === 1) {
        msg += ' One other offer involving these players or picks was cancelled.';
      } else if (cancelled > 1) {
        msg += ' ' + cancelled + ' other offers involving these players or picks were cancelled.';
      }
      return msg;
    });
  }

  function handleConfirmWithReason(action) {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (action === ACTION_DECLINE) {
      run(declineTrade(tradeId, reason), 'Declined. The other owners can see your reason.');
    }
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
  //   accepted  nobody here -- approval and veto are on /admin/trades
  //   final     nobody
  const showDraftControls = isProposer && status === 'draft';
  const canAccept = isParty && status === 'proposed' && !hasAccepted && !hasDeclined;
  const canDecline = isParty && status === 'proposed' && !hasDeclined;
  const showPartyControls = !isFinal && (canAccept || canDecline);

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
        Owner-facing status, not a control. The approver's own recusal notice
        moved to /admin/trades with the approve button; what stays here is the
        sentence a WAITING PARTY needs -- why an accepted trade has not moved.
        It is deliberately vague about which team is conflicted: RLS on
        team_owners means a regular owner cannot be shown who holds the role.
      */}
      {stalledOnRecusal && (
        <p className="empty-note">
          Every party has accepted. This trade is now with the commissioner — rule 7.7(e)
          requires anyone whose own team is involved to recuse, so it needs a commissioner or
          co-commissioner who is not a party to it.
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
              Sending shows this trade to the other owners in it and counts as your acceptance.
              Nobody else sees it until every party has accepted. You may offer the same
              players or picks in other trades at the same time — but once any one trade
              naming them is accepted by every party, every other offer naming them is
              cancelled, and a draft naming them can no longer be sent.
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
              figures above freeze at that moment, the trade becomes visible to the whole
              league, it goes to the commissioner, and every other open offer naming any of
              these players or picks is cancelled.
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

      {/*
        THE READ-ONLY FOOTER APPEARS ONLY WHEN THE VIEWER GENUINELY HAS NO
        ACTION. showDraftControls is part of this condition -- leaving it out is
        what put this sentence under a proposer's own draft.
      */}
      {!showDraftControls &&
        !showPartyControls &&
        !stalledOnRecusal && (
          <p className="empty-note">
            {isFinal
              ? 'This trade is finished. Nothing further can be done to it.'
              : hasDeclined
                ? 'You declined this trade.'
                : isParty && hasAccepted
                  ? 'You have accepted this trade. It is waiting on the other parties or on the commissioner.'
                  : isParty
                    ? 'Every party has answered this trade. It is with the commissioner now.'
                    : 'You are reading this trade. Every party has already answered it — only the commissioner or a co-commissioner can take it further.'}
          </p>
        )}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { discardDraft } from './actions';

// DISCARD IS FOR DRAFTS ONLY, AND IT IS PERMANENT.
//
// The database draws the distinction this control has to mirror: a draft is
// DISCARDED, a sent trade is DECLINED. discard_trade_draft() hard-deletes the
// row and cascades to parties and assets, so it takes no reason -- nobody but
// the proposer has ever seen the thing. decline_trade() takes a reason
// precisely because counterparties were already asked to look at it.
//
// Two-press confirm rather than window.confirm(): a native modal blocks the
// whole page and cannot be styled or dismissed by the Escape handling the rest
// of the app uses. The second press has to be deliberate, and the button is
// disabled while the action is in flight so a double-click cannot fire twice.

export default function DiscardDraftButton({ tradeId, onDiscarded, redirectTo }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setError('');
      return;
    }

    setBusy(true);
    setError('');
    discardDraft(tradeId)
      .then(function (result) {
        if (!result.ok) {
          // The database's wording is the useful one -- it distinguishes "not
          // a draft" from "not yours" in terms an owner can act on.
          setError(result.message);
          setConfirming(false);
          return;
        }
        if (redirectTo) {
          // The trade no longer exists; staying on its detail page renders an
          // empty shell.
          router.push(redirectTo);
          return;
        }
        if (onDiscarded) onDiscarded();
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
    <span className="trade-discard">
      <button
        type="button"
        className="btn btn-quiet btn-danger"
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? 'Discarding…' : confirming ? 'Confirm discard' : 'Discard'}
      </button>
      {confirming && !busy && (
        <span className="empty-note trade-discard-warn">
          Discard this draft? It will be deleted permanently.
        </span>
      )}
      {confirming && !busy && (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={function () {
            setConfirming(false);
          }}
        >
          Cancel
        </button>
      )}
      {error && <span className="form-error trade-discard-error">{error}</span>}
    </span>
  );
}

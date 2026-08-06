'use client';

import { useState } from 'react';
import { withdrawBid, cancelDelegation } from './delegationActions';
import { isStandingBidNote } from '../../lib/delegationNotes';
import { tierRowStatus, tierRowTone } from '../../lib/tierRows';

// The single owner-facing table for a tier: every player this owner
// touched, by hand or by Auto-Bid or both, one row each.
//
// A client component specifically so withdrawBid() and cancelDelegation()
// can be called inside a try/catch and a database refusal rendered inline.
// A Server Action behind a Server Component <form action={...}> has no
// client boundary to catch a throw and produces the Next.js full-page
// error screen instead -- the defect fixed in 2e47e033, which these
// controls must not reintroduce.

// Only a 'pending' bid can be withdrawn; withdraw_bid() refuses every
// other status.
const WITHDRAWABLE_BID_STATUS = 'pending';

// cancel_bid_delegation() refuses exactly one status, 'submitted', because
// that delegation has already become a real sealed bid and deleting the
// delegation row would not withdraw it. Cancel is offered only where it
// can actually succeed.
//
// bid_delegations_status_check allows exactly draft, armed, submitted,
// superseded, skipped, failed and cancelled -- the complete set, which is
// why there is no fallback branch for an eighth value.
//
// THIS LIST IS DELIBERATELY LONGER THAN THE ONE IN lib/tierRows.js.
// DELEGATION_OUTRANKS_WITHDRAWN_BID there holds four statuses; this holds
// five, the extra being 'superseded'. That is not drift.
//
// The two lists answer different questions. That one asks which delegation
// statuses describe a player better than a withdrawn bid does -- and
// 'superseded' does not, because the bid that superseded the delegation IS
// the withdrawn one, so labelling the row "Replaced by your own bid" would
// point at a bid that no longer exists. This one asks which delegations can
// still be cancelled, and a superseded entry can: cancelling it is slate
// housekeeping on a dead row, not an action on any bid.
//
// The visible consequence is intended: a withdrawn bid with a superseded
// delegation reads "Withdrawn" while still offering Cancel. See the
// resolveRowSource() docblock in lib/tierRows.js before changing either list.
const CANCELLABLE_DELEGATION_STATUSES = ['draft', 'armed', 'failed', 'skipped', 'superseded'];

export default function YourBidsPanel({ rows, tierId, tierIsOpen, allowance, used }) {
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Nothing touched in this tier yet -- an empty box would be noise, and
  // the Auto-Bid panel above already carries the get-started messaging.
  if (!rows || rows.length === 0) return null;

  const remaining = allowance - used;
  const noneRemaining = remaining <= 0;

  async function runAction(playerId, work) {
    setError(null);
    setBusyId(playerId);
    try {
      await work();
      setConfirmingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // Control precedence, strictly in this order -- the first branch that
  // matches wins:
  //
  //   1. Tier closed          -> nothing, on any row
  //   2. Live bid ('pending') -> Withdraw + Revise Bid
  //   3. Cancellable entry    -> Cancel
  //   4. Anything else        -> nothing
  //
  // 2 BEFORE 3 IS LOAD-BEARING. A delegation can sit at 'draft' while the
  // bid it produced is still live -- that is exactly what revising a
  // delegation does. Offering Cancel there would suggest that removing the
  // entry removes the bid, which is the confusion behind the original
  // crash in 2e47e033.
  function renderControls(row) {
    if (!tierIsOpen) return null;

    if (row.bid && row.bid.status === WITHDRAWABLE_BID_STATUS) {
      const bidId = row.bid.id;
      if (confirmingId === row.playerId) {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--accent-rust)' }}
              disabled={busyId !== null}
              onClick={() => runAction(row.playerId, () => withdrawBid(bidId))}
            >
              {busyId === row.playerId ? 'Withdrawing…' : 'Confirm withdraw'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busyId !== null}
              onClick={() => setConfirmingId(null)}
            >
              Keep bid
            </button>
          </span>
        );
      }
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {/* Kept visible but disabled when the allowance is spent, so an
              owner can see why they cannot act rather than find the
              control missing. */}
          <button
            type="button"
            className="btn"
            disabled={noneRemaining || busyId !== null}
            onClick={() => setConfirmingId(row.playerId)}
          >
            Withdraw
          </button>
          <a href={'/bids/' + tierId + '/' + row.playerId} className="btn">
            Revise Bid
          </a>
        </span>
      );
    }

    if (
      row.delegation &&
      CANCELLABLE_DELEGATION_STATUSES.indexOf(row.delegation.status) !== -1
    ) {
      const delegationId = row.delegation.id;
      return (
        <button
          type="button"
          className="btn"
          disabled={busyId !== null}
          onClick={() => runAction(row.playerId, () => cancelDelegation(delegationId))}
        >
          {busyId === row.playerId ? 'Cancelling…' : 'Cancel'}
        </button>
      );
    }

    return null;
  }

  return (
    <div className="assistant-box" style={{ marginBottom: 32 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Your Bids &amp; Auto-Bid</p>

      {/* Allowance state comes from the database: the number from
          tier_withdrawal_allowance(), the count from bid_withdrawals rows.
          The divide-by-five rule is never computed here. Dropped entirely
          once the tier closes, along with the buttons -- there is nothing
          left to spend it on. */}
      {tierIsOpen && (
        <p className="empty-note" style={{ marginTop: 8, marginBottom: 4 }}>
          {'Withdrawals used this tier: ' + used + ' of ' + allowance}
        </p>
      )}

      {tierIsOpen && noneRemaining && (
        <p className="empty-note" style={{ marginTop: 0, marginBottom: 4, color: 'var(--accent-rust)' }}>
          You have used every withdrawal for this tier.
        </p>
      )}

      {!tierIsOpen && (
        <p className="empty-note" style={{ marginTop: 8, marginBottom: 4 }}>
          Bidding is closed. These bids are final.
        </p>
      )}

      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}

      <table className="ledger year-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Player</th>
            <th className="col-status">Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              {/* .team-name sits on the inner div rather than the cell: the
                  class sets white-space: nowrap, so a long error_message
                  would otherwise run off the table instead of wrapping. */}
              <td>
                <div className="team-name">
                  {row.playerName}
                  {row.delegation && <span className="void-tag"> AUTO-BID</span>}
                </div>
                {row.delegation && row.delegation.error_message && (
                  <p
                    className={
                      isStandingBidNote(row.delegation.error_message)
                        ? 'row-note warn'
                        : 'row-note'
                    }
                  >
                    {row.delegation.error_message}
                  </p>
                )}
              </td>
              <td className="col-status">
                <span className={'status status-' + tierRowTone(row)}>{tierRowStatus(row)}</span>
              </td>
              <td style={{ textAlign: 'right' }}>{renderControls(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {tierIsOpen && (
        <p className="empty-note" style={{ marginTop: 12 }}>
          Withdrawing is permanent and spends one of your withdrawals for this tier. You can bid on
          that player again afterwards, but the withdrawal is still spent.
        </p>
      )}
    </div>
  );
}

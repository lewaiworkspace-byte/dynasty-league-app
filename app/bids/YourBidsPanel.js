'use client';

import { useState } from 'react';
import { withdrawBid } from './delegationActions';

// A client component specifically so withdrawBid() can be called inside a
// try/catch and a database refusal rendered inline. A Server Action behind
// a Server Component <form action={...}> has no client boundary to catch a
// throw and produces the Next.js full-page error screen instead -- that is
// the defect fixed in 2e47e033 for the Auto-Bid panel's Cancel button, and
// this control must not reintroduce it.
//
// Only a 'pending' bid can be withdrawn; withdraw_bid() refuses every
// other status. The button is offered on exactly that status, and the
// database remains the authority either way.
const WITHDRAWABLE_STATUS = 'pending';

export default function YourBidsPanel({ rows, tierIsOpen, allowance, used }) {
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Nothing committed in this tier yet -- an empty box would be noise, and
  // the Auto-Bid panel above already carries the get-started messaging.
  if (!rows || rows.length === 0) return null;

  const remaining = allowance - used;
  const noneRemaining = remaining <= 0;

  async function handleWithdraw(bidId) {
    setError(null);
    setBusyId(bidId);
    try {
      await withdrawBid(bidId);
      setConfirmingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="assistant-box" style={{ marginBottom: 32 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Your Bids</p>

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
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="team-name">{row.playerName}</td>
              <td
                style={{
                  color: row.status === 'withdrawn' ? 'var(--accent-rust)' : 'var(--text-dim)',
                }}
              >
                {row.status || 'unknown'}
              </td>
              <td style={{ textAlign: 'right' }}>
                {/* No control at all once the tier has closed: a button the
                    database is certain to refuse is worse than no button.
                    Withdrawn rows stay in the list on purpose -- they are
                    this owner's own record of what they did, and a row that
                    vanished would read like a bug. */}
                {tierIsOpen && row.status === WITHDRAWABLE_STATUS && (
                  confirmingId === row.id ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ background: 'var(--accent-rust)' }}
                        disabled={busyId !== null}
                        onClick={() => handleWithdraw(row.id)}
                      >
                        {busyId === row.id ? 'Withdrawing…' : 'Confirm withdraw'}
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
                  ) : (
                    // Kept visible but disabled when the allowance is spent,
                    // so an owner can see why they cannot act rather than
                    // find the control missing.
                    <button
                      type="button"
                      className="btn"
                      disabled={noneRemaining || busyId !== null}
                      onClick={() => setConfirmingId(row.id)}
                    >
                      Withdraw
                    </button>
                  )
                )}
              </td>
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

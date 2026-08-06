'use client';

import { useState } from 'react';
import { cancelDelegation } from './delegationActions';

// cancel_bid_delegation() refuses exactly one status: 'submitted'. That
// refusal is correct and deliberate -- the delegation has already become a
// real sealed bid, and deleting the delegation row would not withdraw it.
// So Cancel is only offered on the statuses where it can actually succeed.
//
// bid_delegations_status_check allows exactly draft, armed, submitted,
// superseded, skipped, failed and cancelled. Those seven are the complete
// set, which is why there is no fallback branch for an eighth value: a row
// whose status matches nothing here simply renders no control, which is
// the safe outcome anyway.
const CANCELLABLE = ['draft', 'armed', 'failed', 'skipped', 'superseded'];

// arm_bid_delegations() writes error_message for owners to read, so it is
// rendered verbatim -- never truncated, never remapped. A second copy of
// the wording in JavaScript would just be a second thing to drift out of
// step with the database.
//
// The one thing read out of it is whether an earlier bid on that player
// is still standing, which is the case an owner actually needs to notice;
// an ordinary skip is informational. Matched case-insensitively so a
// change in capitalisation on the database side does not silently drop
// the highlight.
function isStandingBidNote(message) {
  return (message || '').toLowerCase().indexOf('still standing') !== -1;
}

/**
 * The interactive half of the Auto-Bid panel on /bids.
 *
 * This exists as a client component specifically so cancelDelegation() can
 * be called inside a try/catch. It used to be a Server Component
 * <form action={cancelDelegation.bind(...)}>, which has no client boundary
 * to catch a throw -- so when the database refused to cancel a submitted
 * delegation, the error escaped to the Next.js full-page error screen
 * ("Application error: a server-side exception has occurred") instead of
 * telling the owner what was wrong.
 *
 * @param {object} props
 * @param {string} props.tierId
 * @param {boolean} props.tierIsOpen - see the Revise Bid comment below
 * @param {Array<{id:string, playerId:string, playerName:string, status:string}>} props.rows
 */
export default function DelegationPanelActions({ tierId, tierIsOpen, rows }) {
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function handleCancel(id) {
    setError(null);
    setBusyId(id);
    try {
      await cancelDelegation(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}

      <table className="ledger year-table">
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
              {/* .team-name moves onto the inner div so it keeps the name
                  on one line while letting the note below it wrap -- the
                  class sets white-space: nowrap, which would otherwise run
                  a long message off the table. */}
              <td>
                <div className="team-name">{row.playerName}</div>
                {row.errorMessage && (
                  <p
                    className="empty-note"
                    style={{
                      marginTop: 4,
                      color: isStandingBidNote(row.errorMessage)
                        ? 'var(--accent-rust)'
                        : 'var(--text-dim)',
                    }}
                  >
                    {row.errorMessage}
                  </p>
                )}
              </td>
              <td>{row.status || 'unknown'}</td>
              <td style={{ textAlign: 'right' }}>
                {CANCELLABLE.indexOf(row.status) !== -1 && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busyId !== null}
                    onClick={() => handleCancel(row.id)}
                  >
                    {busyId === row.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}

                {/* A submitted delegation is a real sealed bid, so the only
                    place it can be changed is the manual bid form. That
                    link is conditional on the tier still being open:
                    submit_bid() refuses outside the open window and once
                    resolved_at is set, so linking there after close would
                    hand the owner a contract form they can fill in
                    completely and then cannot submit -- one dead end traded
                    for a quieter one. The link stays conditional even
                    though the bid form route already guards closed tiers
                    with a message of its own: a link that leads somewhere
                    useless is worse than no link, even when the destination
                    explains itself. */}
                {row.status === 'submitted' &&
                  (tierIsOpen ? (
                    <a href={'/bids/' + tierId + '/' + row.playerId} className="btn">
                      Revise Bid
                    </a>
                  ) : (
                    <span className="empty-note" style={{ margin: 0 }}>
                      Bidding is closed. This bid is final.
                    </span>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

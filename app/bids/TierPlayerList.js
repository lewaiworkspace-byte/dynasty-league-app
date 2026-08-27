'use client';

import { useMemo, useState } from 'react';
import { withdrawBid, cancelDelegation } from './delegationActions';
import { hidePlayer, unhidePlayer, unhideAllPlayers } from './hideActions';
import { isStandingBidNote } from '../../lib/delegationNotes';
import { tierRowStatus, tierRowTone } from '../../lib/tierRows';
import PlayerLink from '../../components/PlayerLink';

// THE single table for an open tier. Every player in the tier appears
// exactly once, whether or not this owner has touched him.
//
// What this replaces: an owner-only panel listing the players they had bid
// on, sitting above a public table that listed all of them again. A player
// bid on appeared twice, described in two different vocabularies -- once as
// "Bid placed" with Withdraw and Revise controls, and once as an untouched
// row offering "Submit Bid". The duplication was the visible half; the two
// vocabularies were the worse half.
//
// A client component because withdrawBid() and cancelDelegation() need a
// client boundary to catch a refusal and render it inline. A Server Action
// behind a Server Component form has no such boundary and produces the
// Next.js full-page error screen instead -- the defect fixed in 2e47e033,
// which these controls must not reintroduce.
//
// Renders for logged-out visitors too: canAct false drops every control and
// the owner-status column, leaving the public list the tier has always had.

// Only a 'pending' bid can be withdrawn; withdraw_bid() refuses every other
// status.
const WITHDRAWABLE_BID_STATUS = 'pending';

// cancel_bid_delegation() refuses exactly one status, 'submitted', because
// that delegation has already become a real sealed bid and deleting the
// delegation row would not withdraw it.
//
// DELIBERATELY LONGER THAN DELEGATION_OUTRANKS_WITHDRAWN_BID in
// lib/tierRows.js -- five statuses there, four here plus 'superseded'. Not
// drift: that list asks which delegation statuses describe a player better
// than a withdrawn bid does, this one asks which delegations can still be
// cancelled. A superseded entry can; cancelling it is slate housekeeping on
// a dead row. See the resolveRowSource() docblock in lib/tierRows.js before
// changing either.
const CANCELLABLE_DELEGATION_STATUSES = ['draft', 'armed', 'failed', 'skipped', 'superseded'];

// Rule 6.1 permits exactly one piece of public bidding information while a
// tier is open: "a rough interest level per player (how many bids exist),
// with no amounts and no identities."
//
// ROUGH IS THE OPERATIVE WORD, and it is why these are bands rather than
// the raw count this table used to print. A single number beside a name was
// already more than "rough"; sorting forty-eight players by that number
// turns it into a precise contestedness ranking of the whole tier, which is
// the capability the word withholds. Commissioner ruling, August 13 2026.
//
// Sorting keys off the BAND, never the underlying count -- ordering by the
// exact figure would leak precisely what the label conceals.
const INTEREST_BANDS = [
  { min: 6, rank: 3, label: 'Highly competitive', color: 'var(--accent-rust)' },
  { min: 3, rank: 2, label: 'Heating up', color: 'var(--accent-gold)' },
  { min: 1, rank: 1, label: 'Some interest', color: 'var(--text-dim)' },
  { min: 0, rank: 0, label: 'No bids yet', color: 'var(--text-dim)' },
];

function interestBand(count) {
  const n = Number(count) || 0;
  for (let i = 0; i < INTEREST_BANDS.length; i++) {
    if (n >= INTEREST_BANDS[i].min) return INTEREST_BANDS[i];
  }
  return INTEREST_BANDS[INTEREST_BANDS.length - 1];
}

const SORT_OPTIONS = [
  { key: 'name', label: 'Player name' },
  { key: 'position', label: 'Position' },
  { key: 'interest', label: 'Most contested' },
  { key: 'yours', label: 'Your bids first' },
];

function byName(a, b) {
  return (a.playerName || '').localeCompare(b.playerName || '');
}

export default function TierPlayerList({
  tierId,
  tierIsOpen,
  canAct,
  rows,
  allowance,
  used,
  initialHiddenIds,
}) {
  const [sortKey, setSortKey] = useState('name');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenIds, setHiddenIds] = useState(() => new Set(initialHiddenIds || []));
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const remaining = allowance - used;
  const noneRemaining = remaining <= 0;

  const positions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      if (r.position) set.add(r.position);
    });
    return Array.from(set).sort();
  }, [rows]);

  // A player this owner has a bid or an Auto-Bid entry on is never hidden,
  // whatever bid_player_hides says. Hiding then bidding would otherwise
  // conceal a live commitment -- the one thing an owner most needs to see.
  // Enforced here at render rather than by deleting the row, so the rule
  // holds even if a write failed or a hide was made in another tab.
  function isHidden(row) {
    if (!hiddenIds.has(row.playerId)) return false;
    if (row.bid || row.delegation) return false;
    return true;
  }

  const sorted = useMemo(() => {
    const list = (rows || []).filter(
      (r) => positionFilter === 'ALL' || r.position === positionFilter
    );
    const copy = list.slice();

    if (sortKey === 'position') {
      copy.sort((a, b) => {
        const p = (a.position || '').localeCompare(b.position || '');
        return p !== 0 ? p : byName(a, b);
      });
    } else if (sortKey === 'interest') {
      copy.sort((a, b) => {
        const d = interestBand(b.bidCount).rank - interestBand(a.bidCount).rank;
        return d !== 0 ? d : byName(a, b);
      });
    } else if (sortKey === 'yours') {
      copy.sort((a, b) => {
        const av = a.bid || a.delegation ? 0 : 1;
        const bv = b.bid || b.delegation ? 0 : 1;
        return av !== bv ? av - bv : byName(a, b);
      });
    } else {
      copy.sort(byName);
    }
    return copy;
  }, [rows, sortKey, positionFilter]);

  const visible = sorted.filter((r) => showHidden || !isHidden(r));
  const hiddenCount = sorted.filter((r) => isHidden(r)).length;

  async function runAction(playerId, work) {
    setError(null);
    setBusyId(playerId);
    try {
      const result = await work();
      if (result && result.ok === false) {
        setError(result.message);
      } else {
        setConfirmingId(null);
      }
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  // Hide and unhide update local state first and reconcile after. On a
  // phone, tapping through forty-eight players waiting on a round trip each
  // time is the problem this feature exists to solve.
  async function toggleHide(playerId, hide) {
    setError(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (hide) next.add(playerId);
      else next.delete(playerId);
      return next;
    });

    const result = hide
      ? await hidePlayer(tierId, playerId)
      : await unhidePlayer(tierId, playerId);

    if (result && result.ok === false) {
      setError(result.message);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (hide) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
    }
  }

  async function handleUnhideAll() {
    setError(null);
    const previous = new Set(hiddenIds);
    setHiddenIds(new Set());
    const result = await unhideAllPlayers(tierId);
    if (result && result.ok === false) {
      setError(result.message);
      setHiddenIds(previous);
    }
  }

  // Control precedence, first match wins:
  //   1. Tier closed          -> nothing
  //   2. Live bid ('pending') -> Withdraw + Revise
  //   3. Cancellable entry    -> Cancel
  //   4. Untouched            -> Submit Bid
  //
  // 2 BEFORE 3 IS LOAD-BEARING. A delegation can sit at 'draft' while the
  // bid it produced is still live -- exactly what revising a delegation
  // does. Offering Cancel there suggests removing the entry removes the
  // bid, which is the confusion behind the original crash in 2e47e033.
  function renderControls(row) {
    if (!tierIsOpen) return null;

    if (canAct && row.bid && row.bid.status === WITHDRAWABLE_BID_STATUS) {
      const bidId = row.bid.id;
      if (confirmingId === row.playerId) {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Kept visible but disabled when the allowance is spent, so an
              owner sees why they cannot act rather than finding the control
              missing. */}
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
      canAct &&
      row.delegation &&
      CANCELLABLE_DELEGATION_STATUSES.indexOf(row.delegation.status) !== -1
    ) {
      const delegationId = row.delegation.id;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            disabled={busyId !== null}
            onClick={() => runAction(row.playerId, () => cancelDelegation(delegationId))}
          >
            {busyId === row.playerId ? 'Cancelling…' : 'Cancel'}
          </button>
          <a href={'/bids/' + tierId + '/' + row.playerId} className="btn">
            Bid Directly
          </a>
        </span>
      );
    }

    return (
      <a href={'/bids/' + tierId + '/' + row.playerId} className="btn">
        Submit Bid
      </a>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Sort by
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key} disabled={o.key === 'yours' && !canAct}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Position
          <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="ALL">All positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {canAct && hiddenCount > 0 && (
          <button type="button" className="btn" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Collapse hidden' : 'Show ' + hiddenCount + ' hidden'}
          </button>
        )}

        {canAct && hiddenCount > 0 && (
          <button type="button" className="btn" onClick={handleUnhideAll}>
            Unhide all
          </button>
        )}
      </div>

      {canAct && tierIsOpen && (
        <p className="empty-note" style={{ marginTop: 0 }}>
          {'Withdrawals used this tier: ' + used + ' of ' + allowance}
          {noneRemaining ? ' — you have used every withdrawal for this tier.' : ''}
        </p>
      )}

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>NFL Team</th>
            <th>Interest</th>
            {canAct && <th className="col-status">Your Bid</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const band = interestBand(row.bidCount);
            const hidden = isHidden(row);
            return (
              <tr key={row.playerId} style={hidden ? { opacity: 0.45 } : null}>
                {/* .team-name on the inner div, not the cell: the class sets
                    white-space: nowrap, so a long error_message would run
                    off the table instead of wrapping. */}
                <td data-label="Player">
                  <div className="team-name">
                    <PlayerLink playerId={row.playerId}>{row.playerName}</PlayerLink>
                    {row.delegation && <span className="void-tag"> AUTO-BID</span>}
                    {hidden && <span className="void-tag"> HIDDEN</span>}
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
                <td data-label="Pos">{row.position || '—'}</td>
                <td data-label="NFL Team">{row.nflTeam || 'FA'}</td>
                <td data-label="Interest">
                  <span className="void-tag" style={{ color: band.color }}>
                    {band.label}
                  </span>
                </td>
                {canAct && (
                  <td className="col-status" data-label="Your Bid">
                    {row.bid || row.delegation ? (
                      <span className={'status status-' + tierRowTone(row)}>
                        {tierRowStatus(row)}
                      </span>
                    ) : (
                      <span className="empty-note">—</span>
                    )}
                  </td>
                )}
                <td data-label="" style={{ textAlign: 'right' }}>
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                  >
                    {renderControls(row)}
                    {canAct && tierIsOpen && !row.bid && !row.delegation && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => toggleHide(row.playerId, !hidden)}
                      >
                        {hidden ? 'Unhide' : 'Hide'}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}

          {/* The seam. Hidden rows collapse to a single line that states how
              many are missing, the way a spreadsheet leaves a visible gap in
              its row numbers rather than pretending the rows never existed.
              Only rendered when hidden rows are actually collapsed. */}
          {canAct && hiddenCount > 0 && !showHidden && (
            <tr>
              <td
                colSpan={canAct ? 6 : 5}
                className="empty-note"
                style={{ textAlign: 'center', borderTop: '2px dashed var(--border)' }}
              >
                {hiddenCount + ' player' + (hiddenCount === 1 ? '' : 's') + ' hidden from your view'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {visible.length === 0 && (
        <p className="empty-note">
          No players match this filter.
        </p>
      )}

      {canAct && tierIsOpen && (
        <p className="empty-note" style={{ marginTop: 12 }}>
          Hiding a player only affects your own view — he stays in the tier and still counts toward
          the interest levels above. Bidding on a hidden player unhides him automatically.
          Withdrawing a bid is permanent and spends one of your withdrawals for this tier.
        </p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { formatMoney } from '../../../lib/formatMoney';
import { formatDate } from '../../../lib/formatDate';
import { n, feedTone } from './cardHelpers';

// The player's full EDFL transaction history, from
// player_transaction_feed -- one vocabulary over eight sources (signings,
// trades, releases and reversals, roster moves, losing bids, pass-overs,
// commissioner deletions). Newest first, exactly as the view orders it.
//
// WHAT DIFFERENT OWNERS SEE DIFFERS, ON PURPOSE. The feed is
// security_invoker, so bid rows follow the bids RLS policy: an owner sees
// their own losing bids and nobody else's, while the commissioner and
// co-commissioner see every bid on a closed tier. Signings, trades, cuts
// and roster moves are identical for everyone. Do not "fix" a difference
// between two owners' views of this tab -- it is the auction's sealed-bid
// rule doing its job.
//
// Commissioner corrections (contract deletions) are administrative rather
// than football, so they sit behind a toggle instead of interleaving with
// real transactions by default.

function moneyFor(row) {
  const d = row.detail || {};
  if (row.kind === 'signed_auction' || row.kind === 'signed_rookie' || row.kind === 'signed' || row.kind === 'extended') {
    const total = n(d.total_cash);
    return total === null ? null : formatMoney(total) + ' total';
  }
  if (row.kind === 'released' || row.kind === 'released_june1') {
    const dead =
      (n(d.dead_cap_current_year) || 0) + (n(d.dead_cap_next_year) || 0);
    return formatMoney(dead) + ' dead cap';
  }
  if (row.kind === 'bid_lost' || row.kind === 'bid_withdrawn') {
    const years = d.total_years;
    return years ? years + ' yr offer' : null;
  }
  return null;
}

export default function TransactionsTab({ header, feed }) {
  const [showAdmin, setShowAdmin] = useState(false);

  const rows = (feed || []).filter(function (r) {
    return showAdmin || !r.is_admin_action;
  });
  const adminCount = (feed || []).filter(function (r) {
    return r.is_admin_action;
  }).length;

  if (!feed || feed.length === 0) {
    return (
      <p className="empty-note">
        No EDFL transactions on record for {header.full_name}.
        {header.has_edfl_history
          ? ''
          : ' He has never held an EDFL contract.'}
      </p>
    );
  }

  return (
    <>
      {adminCount > 0 && (
        <div className="control-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={function () {
              setShowAdmin(!showAdmin);
            }}
          >
            {showAdmin
              ? 'Hide commissioner corrections'
              : 'Show commissioner corrections (' + adminCount + ')'}
          </button>
        </div>
      )}

      <ul className="pc-feed">
        {rows.map(function (row) {
          const money = moneyFor(row);
          return (
            <li key={row.source + '-' + row.source_id}>
              <span className="pc-feed-date">{formatDate(row.occurred_at)}</span>
              <span className="pc-feed-body">
                <p className="pc-feed-title">
                  <span className={'status ' + feedTone(row.kind)}>
                    {row.title}
                  </span>
                </p>
                <p className="pc-feed-desc">{row.description}</p>
              </span>
              {money && <span className="pc-feed-money">{money}</span>}
            </li>
          );
        })}
      </ul>

      <p className="pc-note">
        Losing bids appear only to the team that made them; the auction
        seals them for everyone else, permanently. What you see here may
        legitimately differ from what another owner sees.
      </p>
    </>
  );
}

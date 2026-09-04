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
// WHAT DIFFERENT OWNERS SEE CAN STILL DIFFER, ON PURPOSE. The feed is
// security_invoker, so bid rows follow the bids RLS policy. Since the
// transparency decision of September 3, 2026 a losing bid on a VERIFIED tier
// is visible to every owner and names the bidding team. What still differs is
// a WITHDRAWN bid, which only its own team and the commissioner see, and
// anything on a tier that is not yet verified, which stays sealed from
// everyone under 6.1(b). Signings, trades, cuts, roster moves and
// restructures are identical for everyone. Do not "fix" a remaining
// difference between two owners' views -- it is the sealed-bid rule doing its
// job on the part of it that survives.
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
  if (isRestructure(row.kind)) {
    const amt = n(d.amount);
    return amt === null ? null : formatMoney(amt) + ' converted';
  }
  return null;
}

// The feed's kind is derived from contract_events.event_type, which is
// 'restructure'. Both spellings are accepted because the view's own naming was
// not something this file could check, and an unmatched kind here costs the
// money summary silently rather than loudly.
function isRestructure(kind) {
  return kind === 'restructure' || kind === 'restructured';
}

// The view supplies title and description for every row, so this only fills in
// when it has not. Writing the sentence unconditionally would print it twice on
// any row the view already describes.
function fallbackDescription(row) {
  if (!isRestructure(row.kind)) return null;
  const d = row.detail || {};
  const amt = n(d.amount);
  const years = d.proration_years;
  const season = d.season_year;
  if (amt === null || !years) return null;
  return (
    'Restructured — converted ' +
    formatMoney(amt) +
    (season ? ' of ' + season : '') +
    ' salary into a signing bonus over ' +
    years +
    ' seasons.'
  );
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
                <p className="pc-feed-desc">{row.description || fallbackDescription(row)}</p>
              </span>
              {money && <span className="pc-feed-money">{money}</span>}
            </li>
          );
        })}
      </ul>

      <p className="pc-note">
        Bids on a verified tier are published with the bidding team named,
        winning or losing. A withdrawn bid stays visible only to the team that
        withdrew it, and nothing on a tier that is still open appears here at
        all — so what you see may still differ from what another owner sees.
      </p>
    </>
  );
}

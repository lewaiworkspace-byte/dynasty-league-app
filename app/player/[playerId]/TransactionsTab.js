'use client';

import { useState } from 'react';
import { formatCost, formatMoney } from '../../../lib/formatMoney';
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

// ROUNDING DIRECTION -- R-12, applied here in phase 2E-1 (September 18 2026).
// Only one of these three figures is a charge.
//
//   "$628 total" on a signing is the DEAL's headline, which R-12 names as its
//   example of a figure that is neither a cost nor room, and which the
//   Contract tab's history table prints the same way under "Total Value".
//   "$40 converted" on a restructure is the size of a move that has already
//   happened -- nobody is charged the converted amount, it changes shape.
//   "$412 dead cap" on a release IS a charge, and is the one that rounds up.
function moneyFor(row) {
  const d = row.detail || {};
  if (row.kind === 'signed_auction' || row.kind === 'signed_rookie' || row.kind === 'signed' || row.kind === 'extended') {
    const total = n(d.total_cash);
    return total === null ? null : formatMoney(total) + ' total';
  }
  if (row.kind === 'released' || row.kind === 'released_june1') {
    const dead =
      (n(d.dead_cap_current_year) || 0) + (n(d.dead_cap_next_year) || 0);
    return formatCost(dead) + ' dead cap';
  }
  if (row.kind === 'bid_lost' || row.kind === 'bid_withdrawn') {
    const years = d.total_years;
    return years ? years + ' yr offer' : null;
  }
  if (isRestructure(row.kind)) {
    const amt = n(d.amount);
    return amt === null ? null : formatMoney(amt) + ' converted';
  }
  // FIFTH YEAR OPTION rows deliberately have NO money branch. The view's own
  // description already carries the figure and the season ("... exercised the
  // Fifth Year Option - 218 guaranteed for 2027 (Tier 4)"), so a money column
  // beside it would print the same number twice. The snapshot is available at
  // detail.fifth_year_option if a future summary needs one.
  return null;
}

// The view emits 'restructured'. It was previously compared against the bare
// 'restructure' as well, on the assumption that the view's naming could not be
// checked from here; the feed's complete kind vocabulary was published on
// September 6 and 'restructure' is not in it, so that arm matched nothing.
function isRestructure(kind) {
  return kind === 'restructured';
}

// The view supplies title and description for every row, so this only fills in
// when it has not. Writing the sentence unconditionally would print it twice on
// any row the view already describes.
function fallbackDescription(row) {
  // No Fifth Year Option branch, deliberately. fyo_07 gives all four option
  // kinds their own title and description in the view, so writing copy for them
  // here would be a second wording of the same sentence in a place nobody would
  // think to keep in step. Copy for those rows belongs in the view.
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

// LOSING AUCTION BIDS FOLD INTO ONE LINE (UI test batch 6, November 2026).
// Lewis, November 10, 2026: on the card's History box the losing bids "stay
// folded into one line in History, tap to open". The fold sits where the
// newest of them would have been; opening it puts every one back in its own
// place, unchanged. Which bids a reader sees at all is still the feed's
// (security_invoker, above): the fold only counts what arrived.
const FOLDED_KINDS = { bid_lost: true, bid_withdrawn: true };

export default function TransactionsTab({ header, feed, foldBids }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showBids, setShowBids] = useState(false);

  const rows = (feed || []).filter(function (r) {
    return showAdmin || !r.is_admin_action;
  });
  const adminCount = (feed || []).filter(function (r) {
    return r.is_admin_action;
  }).length;

  const bidRows = foldBids
    ? rows.filter(function (r) {
        return FOLDED_KINDS[r.kind];
      })
    : [];
  // The span reads earliest to latest, whatever order the rows came in.
  const bidTimes = bidRows
    .map(function (r) {
      return r.occurred_at;
    })
    .filter(Boolean)
    .sort();
  const bidFirst = bidTimes.length ? formatDate(bidTimes[0]) : null;
  const bidLast = bidTimes.length ? formatDate(bidTimes[bidTimes.length - 1]) : null;
  const bidSpan = !bidFirst ? null : bidFirst === bidLast ? bidFirst : bidFirst + ' – ' + bidLast;

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
          if (foldBids && FOLDED_KINDS[row.kind] && bidRows.length > 0) {
            const fold =
              row === bidRows[0] ? (
                <li key="bid-fold" className="edfl-pc-bidfold">
                  <span className="pc-feed-date">{bidSpan}</span>
                  <span className="pc-feed-body">
                    <p className="pc-feed-title">
                      <span className="status status-off">
                        {bidRows.length === 1 ? '1 bid did not win' : bidRows.length + ' bids did not win'}
                      </span>
                    </p>
                  </span>
                  <span className="pc-feed-money">
                    <button
                      type="button"
                      className="edfl-pc-linkbtn"
                      aria-expanded={showBids}
                      onClick={function () {
                        setShowBids(!showBids);
                      }}
                    >
                      {showBids ? 'Hide' : bidRows.length === 1 ? 'Show it' : 'Show all ' + bidRows.length}
                    </button>
                  </span>
                </li>
              ) : null;
            if (!showBids) return fold;
            return (
              <FoldedPair key={row.source + '-' + row.source_id} fold={fold}>
                <FeedRow row={row} money={money} />
              </FoldedPair>
            );
          }
          return <FeedRow key={row.source + '-' + row.source_id} row={row} money={money} />;
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

function FeedRow({ row, money }) {
  return (
    <li>
      <span className="pc-feed-date">{formatDate(row.occurred_at)}</span>
      <span className="pc-feed-body">
        <p className="pc-feed-title">
          <span className={'status ' + feedTone(row.kind)}>{row.title}</span>
        </p>
        <p className="pc-feed-desc">{row.description || fallbackDescription(row)}</p>
      </span>
      {money && <span className="pc-feed-money">{money}</span>}
    </li>
  );
}

function FoldedPair({ fold, children }) {
  return (
    <>
      {fold}
      {children}
    </>
  );
}

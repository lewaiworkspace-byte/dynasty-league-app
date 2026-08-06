// One row per player, one status, for everything an owner did in a tier.
//
// WHY THIS EXISTS. An owner with a single delegated bid on one player used
// to see him twice on /bids: once in the Auto-Bid panel reading
// "submitted", once in Your Bids reading "pending". Both words were
// accurate -- bid_delegations.status = 'submitted' means "this Auto-Bid
// entry produced a bid", bids.status = 'pending' means "that bid is live
// and awaiting evaluation". They are different facts about different rows
// in different tables, and none of that is visible or interesting to
// someone who placed one bid on one player. The two panels existed because
// they were built in separate sessions against separate tables, not
// because an owner thinks about a tier in two halves.
//
// Pure functions, no React, so the server-rendered closed-tier recap and
// the interactive open-tier panel can speak identical vocabulary rather
// than each inventing its own.

// Owner-facing wording. 'passed_over' and 'superseded' are schema words
// that used to reach the screen unedited; nothing here is a column value.
//
// Deliberately no "not final" qualifier on any label: the closed-tier
// recap carries that warning once, above the table. Repeating it on every
// row would turn a caveat into wallpaper.
const BID_STATUS_LABELS = {
  pending: 'Bid placed',
  winner: 'Winning',
  lost: 'Outbid',
  passed_over: 'Passed over',
  withdrawn: 'Withdrawn',
};

const DELEGATION_STATUS_LABELS = {
  draft: 'Auto-Bid ready, not armed',
  armed: 'Auto-Bid armed',
  skipped: 'Skipped, over your ceiling',
  failed: 'Auto-Bid failed',
  cancelled: 'Auto-Bid cancelled',
  superseded: 'Replaced by your own bid',
  submitted: 'Bid placed',
};

// Delegation statuses that describe a LIVE Auto-Bid entry -- one that
// still intends to produce a bid. See the withdrawal carve-out in
// tierRowStatus() for why this list exists and why it stops here:
// 'submitted' is excluded because such an entry has already produced its
// bid and that bid is the fact worth reporting.
const LIVE_DELEGATION_STATUSES = ['draft', 'armed'];

// hasOwnProperty rather than a bare lookup so a status that happens to
// collide with something on Object.prototype ('constructor', 'toString')
// cannot return a function instead of a label.
function labelFor(labels, status) {
  if (typeof status !== 'string' || status === '') return null;
  if (Object.prototype.hasOwnProperty.call(labels, status)) return labels[status];
  // Unrecognised values fall through to the raw string on purpose. A
  // status added to the database later should look odd on screen, not
  // vanish into an empty cell or throw.
  return status;
}

/**
 * Full outer merge of an owner's bids and delegations in one tier, keyed
 * on player_id. A player appears once whether they were bid on by hand, by
 * Auto-Bid, or both.
 *
 * Entries that never became bids are kept: a skipped or cancelled Auto-Bid
 * entry is still part of the owner's picture of the tier.
 *
 * @param {object} input
 * @param {Array<{id:string, player_id:string, status:string}>} [input.bids]
 * @param {Array<{id:string, player_id:string, status:string, error_message:string}>} [input.delegations]
 * @param {Map<string, string>} [input.playerNames]
 * @returns {Array<{playerId:string, playerName:string, bid:object|null, delegation:object|null}>}
 */
export function buildTierRows({ bids, delegations, playerNames }) {
  const names = playerNames || new Map();
  const byPlayer = new Map();

  function rowFor(playerId) {
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, {
        playerId,
        playerName: names.get(playerId) || 'Unknown Player',
        bid: null,
        delegation: null,
      });
    }
    return byPlayer.get(playerId);
  }

  (bids || []).forEach((b) => {
    rowFor(b.player_id).bid = b;
  });

  (delegations || []).forEach((d) => {
    rowFor(d.player_id).delegation = d;
  });

  return Array.from(byPlayer.values()).sort((a, b) =>
    (a.playerName || '').localeCompare(b.playerName || '')
  );
}

/**
 * The single owner-facing status for a merged row.
 *
 * THE BID WINS when both exist. A live bid is the more important fact, and
 * the delegation's own 'submitted' was only reporting that same bid
 * second-hand anyway.
 *
 * ONE CARVE-OUT: a WITHDRAWN bid is not a live bid, so it does not get to
 * outrank a live Auto-Bid entry on the same player.
 *
 * That combination is reachable. Rule 6.6(c) lets an owner come back to a
 * player after withdrawing, and upsert_bid_delegation() no longer treats a
 * withdrawn bid as a blocker -- so "withdrawn bid, plus a fresh draft or
 * armed delegation on the same player" is a state an owner can put
 * themselves in deliberately. Without this carve-out the row read
 * "Withdrawn" while YourBidsPanel offered a Cancel button for the live
 * Auto-Bid entry sitting behind it: the status described the past, the
 * control acted on the present, and the two contradicted each other on
 * screen.
 *
 * So when the bid is withdrawn AND a delegation is draft or armed, the
 * delegation's label wins -- the Auto-Bid entry is the live fact and the
 * withdrawal is history. Every other combination is unchanged: a withdrawn
 * bid with a cancelled delegation, or with none at all, still reads
 * "Withdrawn", because in those cases nothing live is standing behind it.
 *
 * @param {{bid:object|null, delegation:object|null}} row
 * @returns {string}
 */
export function tierRowStatus(row) {
  if (!row) return 'unknown';

  const bid = row.bid;
  const delegation = row.delegation;

  const withdrawnBidBehindLiveEntry =
    bid &&
    bid.status === 'withdrawn' &&
    delegation &&
    LIVE_DELEGATION_STATUSES.indexOf(delegation.status) !== -1;

  if (bid && !withdrawnBidBehindLiveEntry) {
    const label = labelFor(BID_STATUS_LABELS, bid.status);
    if (label !== null) return label;
  }
  if (delegation) {
    const label = labelFor(DELEGATION_STATUS_LABELS, delegation.status);
    if (label !== null) return label;
  }
  return 'unknown';
}

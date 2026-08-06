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

// Visual tone per status, consumed as a .status-{tone} class. Lives beside
// the labels for the same reason the labels live here: two surfaces render
// these rows, and a status-to-colour map copied into each component is two
// things to drift apart the next time a status is added.
//
// Four tones only, matching globals.css:
//
//   live -- gold. In flight, or waiting on the owner to do something.
//   good -- green. The outcome the owner wanted.
//   bad  -- red. No bid, or a bid that lost.
//   off  -- grey. Deliberately over, and nothing to act on.
//
// 'draft' is 'live' rather than 'off' on purpose: an unarmed entry will
// never fire, which is the single most important thing for an owner to
// catch before the tier closes. Grey would bury it.
//
// 'skipped' is 'bad' rather than 'live' because the ceiling has already
// been applied -- the owner wanted a bid on that player and does not have
// one. Nothing further will happen.
const BID_STATUS_TONES = {
  pending: 'live',
  winner: 'good',
  lost: 'bad',
  passed_over: 'bad',
  withdrawn: 'off',
};

const DELEGATION_STATUS_TONES = {
  draft: 'live',
  armed: 'live',
  skipped: 'bad',
  failed: 'bad',
  cancelled: 'off',
  superseded: 'off',
  submitted: 'live',
};

// Unrecognised statuses render their raw string via labelFor(); they get
// the neutral tone rather than a colour that would assert a meaning the
// code does not actually know.
const DEFAULT_TONE = 'off';

// Delegation statuses that OUTRANK a withdrawn bid on the same player.
// See the carve-out in resolveRowSource() below; this is the list it tests.
//
// All four arise the same way: the owner re-delegated that player AFTER
// withdrawing. The delegation therefore describes the more recent event
// and "Withdrawn" is stale history. 'skipped' matters most of the four --
// it is the only thing on screen that explains why the owner has no live
// bid on that player right now.
//
// TWO STATUSES ARE DELIBERATELY ABSENT, and both belong to the bid:
//
//   'superseded' -- the supersede trigger fires when a manual bid stands a
//   delegation down, so the bid that superseded it IS the withdrawn one.
//   "Replaced by your own bid" would point at a bid that no longer exists,
//   while "Withdrawn" is exactly right.
//
//   'cancelled' -- withdraw_bid() sets the delegation to cancelled itself,
//   so this pairing is just the ordinary post-withdrawal state. The
//   withdrawal is the fact worth showing.
//
// 'submitted' is absent for a different reason: such an entry has already
// produced its bid, and that bid is what gets reported.
const DELEGATION_OUTRANKS_WITHDRAWN_BID = ['draft', 'armed', 'skipped', 'failed'];

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

function usableStatus(status) {
  return typeof status === 'string' && status !== '';
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
 * Which of the two rows -- the bid or the delegation -- actually describes
 * this player, and the raw status on it.
 *
 * Extracted so that the label and the colour cannot disagree about which
 * source won. Every precedence rule below lives here and nowhere else; the
 * two exported functions differ only in which map they look the result up
 * in.
 *
 * THE BID WINS when both exist. A live bid is the more important fact, and
 * the delegation's own 'submitted' was only reporting that same bid
 * second-hand anyway.
 *
 * ONE CARVE-OUT: a WITHDRAWN bid is not a live bid, so it does not get to
 * outrank a delegation that was created after it.
 *
 * That combination is reachable. Rule 6.6(c) lets an owner come back to a
 * player after withdrawing, and upsert_bid_delegation() no longer treats a
 * withdrawn bid as a blocker -- so "withdrawn bid, plus a re-delegation on
 * the same player" is a state an owner can put themselves in
 * deliberately. Without this carve-out the row read "Withdrawn" while
 * YourBidsPanel offered a Cancel button for the Auto-Bid entry sitting
 * behind it: the status described the past, the control acted on the
 * present, and the two contradicted each other on screen.
 *
 * The four statuses in DELEGATION_OUTRANKS_WITHDRAWN_BID above therefore
 * win over a withdrawn bid; see that constant for why 'superseded' and
 * 'cancelled' are excluded and stay with the bid.
 *
 * ONE MISMATCH SURVIVES AND IS INTENDED -- DO NOT "FIX" IT. A withdrawn
 * bid with a SUPERSEDED delegation reads "Withdrawn" while YourBidsPanel
 * still offers Cancel, because 'superseded' is in that panel's cancellable
 * list. That is correct: the Cancel is slate housekeeping on a dead entry,
 * not an action on the bid. Aligning the two lists would relabel the row
 * "Replaced by your own bid", pointing at a bid that no longer exists.
 *
 * @param {{bid:object|null, delegation:object|null}} row
 * @returns {{kind:'bid'|'delegation', status:string}|null}
 */
function resolveRowSource(row) {
  if (!row) return null;

  const bid = row.bid;
  const delegation = row.delegation;

  const delegationWinsOverWithdrawnBid =
    bid &&
    bid.status === 'withdrawn' &&
    delegation &&
    DELEGATION_OUTRANKS_WITHDRAWN_BID.indexOf(delegation.status) !== -1;

  if (bid && !delegationWinsOverWithdrawnBid && usableStatus(bid.status)) {
    return { kind: 'bid', status: bid.status };
  }
  if (delegation && usableStatus(delegation.status)) {
    return { kind: 'delegation', status: delegation.status };
  }
  return null;
}

/**
 * The single owner-facing status for a merged row.
 *
 * @param {{bid:object|null, delegation:object|null}} row
 * @returns {string}
 */
export function tierRowStatus(row) {
  const source = resolveRowSource(row);
  if (!source) return 'unknown';

  const labels = source.kind === 'bid' ? BID_STATUS_LABELS : DELEGATION_STATUS_LABELS;
  const label = labelFor(labels, source.status);
  return label === null ? 'unknown' : label;
}

/**
 * The visual tone for that same status, as a .status-{tone} suffix.
 *
 * Always paired with tierRowStatus() on the same row, and always resolved
 * from the same source, so the colour cannot describe the bid while the
 * words describe the delegation.
 *
 * @param {{bid:object|null, delegation:object|null}} row
 * @returns {'live'|'good'|'bad'|'off'}
 */
export function tierRowTone(row) {
  const source = resolveRowSource(row);
  if (!source) return DEFAULT_TONE;

  const tones = source.kind === 'bid' ? BID_STATUS_TONES : DELEGATION_STATUS_TONES;
  if (Object.prototype.hasOwnProperty.call(tones, source.status)) {
    return tones[source.status];
  }
  return DEFAULT_TONE;
}

// The status vocabulary for trades -- the counterpart to lib/tierRows.js.
//
// LABELS AND TONES ONLY. No cap, cash or roster arithmetic appears in this
// file or anywhere else in JS. Every figure a trade screen shows comes from
// trade_impact(), which is the single source of those numbers by design: an
// owner's preview and the commissioner's execution read the same RPC, so they
// cannot disagree. Reimplementing any of it client-side throws that guarantee
// away. See app/trades/TradeImpactCards.js.
//
// Pure functions, no React, so a server-rendered list and a client detail
// panel speak identical vocabulary rather than each inventing its own.

// Owner-facing wording. None of these is a column value.
//
// 'accepted' deliberately reads "awaiting execution" rather than "in
// commissioner review": there is no review step in the database. approved_at
// is set by execute_trade() itself, so acceptance is followed by execution
// and nothing sits between them. Calling it "review" would name a stage that
// does not exist and imply a queue nobody is working.
//
// 'reversed' is a terminal state reached only from 'executed', added August
// 27, 2026 with reverse_trade(). It is NOT a synonym for 'vetoed': a veto
// stops a trade before it happens and is appealable through the grievance
// process under 7.7(d), while a reversal undoes one that already happened and
// is a commissioner correction tool with no appeal attached. Owners will read
// these two words as near-identical unless the surrounding text distinguishes
// them, which is why the detail page carries a full explanation rather than
// leaving the chip to carry the meaning alone.
const TRADE_STATUS_LABELS = {
  draft: 'Draft — not sent',
  proposed: 'Awaiting acceptance',
  accepted: 'Accepted — awaiting execution',
  approved: 'Approved',
  executed: 'Executed',
  declined: 'Declined',
  vetoed: 'Vetoed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  reversed: 'Reversed',
};

// 'reversed' takes the 'bad' tone rather than 'off'. 'off' is for a trade
// that quietly never happened -- a discarded draft, a cancellation, an
// expiry -- and reads as unremarkable. A reversal is the undoing of something
// that DID happen, with players and money already moved and then moved back,
// and it should carry the same visual weight as a veto or a decline. Anyone
// scanning the completed list needs it to stand out.
const TRADE_STATUS_TONES = {
  draft: 'off',
  proposed: 'live',
  accepted: 'live',
  approved: 'live',
  executed: 'good',
  declined: 'bad',
  vetoed: 'bad',
  cancelled: 'off',
  expired: 'off',
  reversed: 'bad',
};

// 'approved' has NO SETTER as of August 25, 2026. It is carried here because
// the enum carries it and because a review stage is expected to land between
// 'accepted' and 'executed' later. A status with no setter is not dead code
// to be deleted -- 'vetoed' sat in exactly this condition until veto_trade()
// shipped, and deleting it would have meant rebuilding it.

const DEFAULT_TONE = 'off';

/**
 * Owner-facing label for a trade status.
 *
 * An unrecognised status falls through to its raw value rather than being
 * dropped or blanked -- same principle as lib/tierRows.js. A new status added
 * database-side should look unfamiliar on screen, not invisible.
 *
 * @param {string} status
 * @returns {string}
 */
export function tradeStatusLabel(status) {
  if (!status) return 'Unknown';
  if (Object.prototype.hasOwnProperty.call(TRADE_STATUS_LABELS, status)) {
    return TRADE_STATUS_LABELS[status];
  }
  return status;
}

/**
 * Chip tone for a trade status: 'live' | 'good' | 'bad' | 'off'.
 * Maps to .status-live / .status-good / .status-bad / .status-off.
 *
 * @param {string} status
 * @returns {string}
 */
export function tradeStatusTone(status) {
  if (!status) return DEFAULT_TONE;
  if (Object.prototype.hasOwnProperty.call(TRADE_STATUS_TONES, status)) {
    return TRADE_STATUS_TONES[status];
  }
  return DEFAULT_TONE;
}

/** The chip class name for a status. */
export function tradeStatusClass(status) {
  return 'status status-' + tradeStatusTone(status);
}

/**
 * A trade nobody can act on any more.
 *
 * 'executed' is final HERE but is the one status reverse_trade() will accept,
 * and that is not a contradiction: this function answers "can a party or an
 * approver still act on it in the ordinary flow", and reversal is a
 * commissioner correction tool outside that flow. TradePanel gates the
 * Reverse control on its own canReverse flag, computed from the reversal
 * ruling, and never on this function. 'reversed' is final in every sense --
 * reverse_trade() refuses a second reversal outright.
 */
export function isFinalStatus(status) {
  return (
    status === 'executed' ||
    status === 'declined' ||
    status === 'vetoed' ||
    status === 'cancelled' ||
    status === 'expired' ||
    status === 'reversed'
  );
}

/** Still open to acceptance or refusal by a party. */
export function isLiveStatus(status) {
  return status === 'proposed' || status === 'accepted' || status === 'approved';
}

// Which section of /trades a trade belongs in. One function so the list page
// and any future filter agree on the boundaries.
//
// 'awaiting_you' outranks the rest deliberately: a trade needing this owner's
// answer is the only thing on that page they must act on, and it would
// otherwise be buried among trades they merely have to watch.
export const SECTION_AWAITING_YOU = 'awaiting_you';
export const SECTION_YOUR_DRAFTS = 'your_drafts';
export const SECTION_IN_FLIGHT = 'in_flight';
export const SECTION_COMPLETED = 'completed';

/**
 * @param {object} trade      a trades row
 * @param {object|null} myParty  this owner's trade_parties row, if any
 * @returns {string} one of the SECTION_* constants
 */
export function tradeSection(trade, myParty) {
  if (trade.status === 'draft') return SECTION_YOUR_DRAFTS;
  if (isFinalStatus(trade.status)) return SECTION_COMPLETED;
  if (
    trade.status === 'proposed' &&
    myParty &&
    !myParty.accepted_at &&
    !myParty.declined_at
  ) {
    return SECTION_AWAITING_YOU;
  }
  return SECTION_IN_FLIGHT;
}

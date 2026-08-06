// Shared reading of bid_delegations.error_message.
//
// arm_bid_delegations() writes these messages for owners to read, so they
// are always rendered verbatim -- never truncated, never remapped. The one
// thing read out of the text is whether an earlier bid on that player is
// still standing, which is the case an owner actually needs to notice; an
// ordinary skip is informational.
//
// This lives in its own module rather than inside a component because two
// separate surfaces now render these messages: the interactive Auto-Bid
// panel (app/bids/DelegationPanelActions.js, a client component) and the
// read-only closed-tier recap (app/bids/page.js, server-rendered). A copy
// of the sentinel string in each would be two things to drift out of step
// with the database -- the same argument that keeps the message text
// itself out of JavaScript.
//
// Matched case-insensitively so a capitalisation change on the database
// side cannot silently drop the highlight.
export function isStandingBidNote(message) {
  return (message || '').toLowerCase().indexOf('still standing') !== -1;
}

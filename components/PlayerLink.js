/**
 * The ONE way a player's name becomes a link to his Player Card.
 *
 * Renders the name as a plain anchor to /player/[playerId]. A tap opens the
 * card in the pop-up sheet (components/SheetHost.js; Lewis, November 11 2026:
 * "pop up screens like Sleeper ... swipe it down to exit"), over the page the
 * owner is reading, so he never loses his place -- the reason for the August
 * 27 2026 decision that the card open in a new window, which the sheet
 * replaces. It therefore carries NO target: a target other than _self tells
 * the sheet to leave the link alone. Ctrl/Cmd-click and middle-click still
 * open a new tab, and with no script the link is an ordinary page load.
 *
 * Null-safe by design: chart rows for unmatched draft picks (Dylan Sampson
 * before mapping, etc.) and legacy rows carry no player_id. Passing a
 * missing id renders the bare name with no dead link -- callers never need
 * to branch. This mirrors how ValuesTable already treated its unmatched
 * rows.
 *
 * Keep this a plain <a>, not next/link. next/link prefetches every player
 * page on a 40-row cap sheet, the card is a full data fetch per player, and
 * its own click handler would navigate before the sheet saw the tap. A plain
 * anchor costs nothing until clicked.
 */
export default function PlayerLink({ playerId, className, children }) {
  if (!playerId) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={'/player/' + playerId}
      className={'player-link' + (className ? ' ' + className : '')}
    >
      {children}
    </a>
  );
}

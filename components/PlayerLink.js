/**
 * The ONE way a player's name becomes a link to his Player Card.
 *
 * Renders the name as an anchor to /player/[playerId] that opens in a new
 * window, per commissioner decision August 27 2026: the card is a reference
 * document, and an owner reading a trade or a cap sheet should not lose
 * their place to look a player up.
 *
 * Null-safe by design: chart rows for unmatched draft picks (Dylan Sampson
 * before mapping, etc.) and legacy rows carry no player_id. Passing a
 * missing id renders the bare name with no dead link -- callers never need
 * to branch. This mirrors how ValuesTable already treated its unmatched
 * rows.
 *
 * Keep this a plain <a>, not next/link. next/link with target="_blank"
 * works, but it also prefetches every player page on a 40-row cap sheet,
 * and the card is a full data fetch per player. A plain anchor costs
 * nothing until clicked.
 */
export default function PlayerLink({ playerId, className, children }) {
  if (!playerId) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={'/player/' + playerId}
      target="_blank"
      rel="noopener noreferrer"
      className={'player-link' + (className ? ' ' + className : '')}
    >
      {children}
    </a>
  );
}

import PlayerLink from './PlayerLink';
import ComplianceCountdown from './ComplianceCountdown';

/**
 * OPEN NEGOTIATING WINDOWS -- commissioner request, October 5, 2026; moved
 * October 6, 2026 to the TOP of Team HQ, between the compliance banner (above)
 * and the tabs (below), so it is on screen whichever tab is open.
 *
 * Every free agency (Rule 5.14) and poach (Rule 5.17) window that is still
 * taking offers, league-wide and identical on every team's HQ, soonest to close
 * first. app/team/[teamId]/page.js reads the rows from
 * open_negotiation_windows() through the SESSION client and hands them here.
 * That function reads free_agent_window_board, so:
 *   - WHO OPENED A WINDOW IS NEVER SHOWN (PN-3) -- the function does not return
 *     it, and this component must not look it up;
 *   - "contested" is a yes/no, never a count of offers (FA-D);
 *   - the poach row names the team whose practice squad he is on, which the
 *     Poaching board already shows every owner;
 *   - "You have an offer in" is the viewer's OWN team only.
 * The deadline label is composed in the database, in Eastern; the countdown
 * only subtracts (ComplianceCountdown). The owner's red "someone is poaching
 * your player" strip (PoachAlert) is separate and sits above the banner.
 *
 * Nothing open renders the commissioner's sentence: "There are currently no
 * open negotiating windows." A failed read says so instead, because "none are
 * open" and "we could not check" are different facts.
 *
 * A server component: no state, no clock. The only client piece is the
 * countdown, which fills in after mount.
 */
function Body(props) {
  if (props.gated) {
    return (
      <p className="empty-note">
        Your login is not linked to a team yet, so negotiating windows are not being shown.
      </p>
    );
  }
  if (props.error) {
    return (
      <div className="form-error">
        Negotiating windows could not be loaded: {props.error}. This block is not telling you
        whether any window is open &mdash; check <a href="/free-agency">Free Agency</a> and{' '}
        <a href="/poaching">Poaching</a>.
      </div>
    );
  }
  const rows = props.rows || [];
  if (rows.length === 0) {
    return <p className="empty-note">There are currently no open negotiating windows.</p>;
  }
  return (
    <div className="edfl-list edfl-windows">
      {rows.map(function (w) {
        const isPoach = w.kind === 'poach';
        const href = isPoach ? '/poaching' : '/free-agency';
        const facts = [];
        facts.push(w.is_contested ? 'Contested' : 'Not contested');
        if (isPoach && w.bar_text) facts.push('A bid must beat ' + w.bar_text);
        if (w.i_have_offer) facts.push('You have an offer in');
        return (
          <div
            className={'edfl-list-item' + (w.is_my_player ? ' is-flag' : '')}
            key={w.window_id}
          >
            <div className="edfl-list-when">
              Closes {w.closes_label}
              <div className="edfl-windows-left">
                <ComplianceCountdown deadline={w.closes_at} />
              </div>
            </div>
            <div className="edfl-list-what">
              <div className="edfl-list-title">
                <span className={'edfl-windows-kind' + (isPoach ? ' is-poach' : '')}>
                  {isPoach ? 'POACH' : 'FREE AGENT'}
                </span>{' '}
                <PlayerLink playerId={w.player_id}>{w.player_name}</PlayerLink>
                <span className="edfl-list-note">
                  {' '}
                  {(w.position || '?') + (w.nfl_team ? ', ' + w.nfl_team : '')}
                </span>
              </div>
              <div className="edfl-list-note">
                {isPoach
                  ? w.is_my_player
                    ? 'Your practice squad player. '
                    : 'Practice squad of ' + (w.incumbent_team_name || 'another team') + '. '
                  : 'In-season free agent. '}
                {facts.join(' · ')}
                {' · '}
                <a href={href}>
                  {w.i_have_offer
                    ? 'Review your offer'
                    : isPoach && w.is_my_player
                    ? 'Bid to keep him'
                    : 'Make an offer'}
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function NegotiationWindows(props) {
  return (
    <section className="edfl-hq-block edfl-windows-section" aria-label="Open negotiating windows">
      <h2 className="section-heading">Open negotiating windows</h2>
      <Body rows={props.rows} error={props.error} gated={Boolean(props.gated)} />
      <p className="page-actions edfl-hq-links">
        <a className="btn" href="/free-agency">
          In-Season Free Agency
        </a>
        <a className="btn" href="/poaching">
          Poaching
        </a>
      </p>
    </section>
  );
}

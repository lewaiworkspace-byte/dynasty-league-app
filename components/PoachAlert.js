import { createSupabaseServerClient } from '../lib/supabaseServerClient';
import ComplianceCountdown from './ComplianceCountdown';

/**
 * POACH ALERT -- "another team is bidding for your practice squad player".
 * October 4, 2026.
 *
 * Commissioner rulings, October 4 2026:
 *   - the team being poached is told on the app home page (Team HQ is the
 *     front door, R-8) and through the channels he chose on /notifications;
 *   - Dianna announces every poach window in #insider-threat;
 *   - the team that opened the window stays hidden until it resolves, exactly
 *     as free_agent_window_board hides opened_by.
 *
 * Rendered by app/team/[teamId]/page.js on the owner's OWN Team HQ only, above
 * the compliance banner, one strip per open poach window on his practice
 * squad. my_poach_alerts() reads auth.uid() and returns the caller's own team
 * only; it never returns another team's windows, any bid, or who opened it.
 *
 * WHAT THIS COMPONENT DOES NOT DO: decide anything. The deadline label, the
 * rookie bar or floor and the "how to keep him" sentence are composed in the database
 * (the emails and DMs come from the same facts in poach_notice_text). If a
 * sentence reads wrong, fix the function, not this file. The countdown ticks
 * from the ISO instant and never formats a date (ComplianceCountdown).
 *
 * NO WINDOW, NO STRIP. A failed read says so in a quiet line, because "nobody
 * is poaching you" and "we could not check" are different facts.
 */
export default async function PoachAlert() {
  let alerts = [];
  let failed = false;
  try {
    const server = await createSupabaseServerClient();
    const { data, error } = await server.rpc('my_poach_alerts');
    if (error) {
      console.error('my_poach_alerts failed:', error);
      failed = true;
    } else {
      alerts = Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error('my_poach_alerts threw:', e);
    failed = true;
  }

  if (failed) {
    return (
      <div className="ntf-strip ntf-strip-unknown poach-alert" role="status">
        Could not check whether anyone is bidding for your practice squad players. Open{' '}
        <a href="/poaching">Poaching</a> to see.
      </div>
    );
  }
  if (alerts.length === 0) return null;

  return (
    <div className="poach-alerts">
      {alerts.map(function (a) {
        const who =
          a.player_name +
          ' (' +
          (a.position || '?') +
          (a.nfl_team ? ', ' + a.nfl_team : '') +
          ')';
        return (
          <div className="ntf-strip ntf-strip-bad poach-alert" role="alert" key={a.window_id}>
            <div className="ntf-strip-row">
              <span className="ntf-strip-icon" aria-hidden="true">
                !
              </span>
              <div className="ntf-strip-main">
                <div className="ntf-strip-title">
                  Another team is trying to poach {who} from your practice squad.
                </div>
                <div className="ntf-strip-sub">
                  Window closes <strong>{a.closes_label}</strong>
                  <ComplianceCountdown deadline={a.closes_at} />
                  {a.is_rookie && a.bar_text ? (
                    <>
                      {' · '}A bid must beat <strong>{a.bar_text}</strong>
                    </>
                  ) : null}
                  {a.floor_text ? (
                    <>
                      {' · '}Rival bids are worth at least <strong>{a.floor_text}</strong>
                    </>
                  ) : null}
                  {a.i_have_bid ? <> {' · '}You have bid to keep him.</> : null}
                </div>
              </div>
              <a className="btn ntf-strip-fix" href="/poaching">
                {a.i_have_bid ? 'Review bid' : 'Bid to keep him'}
              </a>
            </div>
            <details className="ntf-strip-details">
              <summary>How to keep him</summary>
              <p className="ntf-strip-note">{a.how_to_keep}</p>
              <p className="ntf-strip-note">
                Who opened the window stays hidden until it resolves (Rule 5.17). If another team
                wins, he goes to its active roster and you receive nothing in return.{' '}
                <a href="/notifications">Choose how else you are told</a>.
              </p>
            </details>
          </div>
        );
      })}
    </div>
  );
}

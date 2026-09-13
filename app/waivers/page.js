import { supabase } from '../../lib/supabaseClient';
import { formatDateTime, EASTERN_TIME_ZONE } from '../../lib/formatDate';
import { loadWaiverState } from './actions';
import WaiverBoard from './WaiverBoard';

// Claims close on a wall clock and the board is sealed per viewer -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Waiver wire' };

// THE WAIVER WIRE.
//
// PUBLIC, LIKE THE SCOREBOARD. A signed-out reader gets the wire and the last run; only
// the claim controls need a session, and the database gates every one of them
// independently. There is no redirect here and there must not be one -- the home page
// draws this link for everybody.
//
// WHY THIS PAGE SHOWS SO LITTLE ABOUT OTHER TEAMS' CLAIMS. Until a run executes, RLS on
// waiver_claims shows an owner only their own rows, so the wire carries no count and no
// names of who else is in. That is the same ruling as free agency's contested flag, and
// it is enforced by the database rather than by anything here.
//
// THE DATABASE DECIDES WHETHER THE WIRE IS OPEN. edfl_wire_live() is the only thing this
// page asks; there is no calendar comparison and no clock here.
export default async function WaiversPage() {
  const [{ data: config }, state] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    loadWaiverState(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  const live = state.ok && state.data.live;
  const nextRun = live ? state.data.nextRun : null;

  // The run's day and instant, both read off runs_at in Eastern rather than written as
  // constants: a run that ever moved off a Wednesday midnight would otherwise be labelled
  // with the old day. Server component, so this never hydrates.
  const runWeekday = nextRun
    ? new Date(nextRun.runs_at).toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: EASTERN_TIME_ZONE,
      })
    : null;

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">
        {leagueName} &middot; {season}
      </p>
      <h1>Waiver Wire</h1>

      {!state.ok && <div className="form-error">{state.message}</div>}

      {state.ok && !live && (
        <p className="empty-note">The waiver wire is not open yet.</p>
      )}

      {live && (
        <>
          <p className="subhead">
            Players cut in-season sit on the wire until the next run. Claim any of them;
            claims are tried in the order you set, and nobody sees another owner&apos;s
            claims until the run has executed.
          </p>

          {nextRun && (
            <p className="form-notice">
              {'Week ' + nextRun.week_number + ' run — ' + runWeekday + ', ' +
                formatDateTime(nextRun.runs_at) + '. Claims close then.'}
            </p>
          )}

          <WaiverBoard
            signedIn={state.data.signedIn}
            teamId={state.data.teamId}
            nextRun={nextRun}
            wire={state.data.wire}
            myClaims={state.data.myClaims}
            roster={state.data.roster}
            lastRun={state.data.lastRun}
          />
        </>
      )}
    </main>
  );
}

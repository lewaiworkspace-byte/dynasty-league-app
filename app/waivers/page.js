import { supabase } from '../../lib/supabaseClient';
import { EASTERN_TIME_ZONE } from '../../lib/formatDate';
import { loadWaiverState } from './actions';
import WaiverBoard from './WaiverBoard';
import Breadcrumbs from '../../components/Breadcrumbs';

// Claims close on a wall clock and the board is sealed per viewer -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Waiver wire' };

// THE WAIVER WIRE.
//
// PUBLIC, LIKE THE SCOREBOARD. A signed-out reader gets the wire and the last run; only
// the claim controls need a session, and the database gates every one of them
// independently. There is no redirect here and there must not be one -- the drawer draws
// this link for everybody.
//
// WHY THIS PAGE SHOWS SO LITTLE ABOUT OTHER TEAMS' CLAIMS. Until a run executes, RLS on
// waiver_claims shows an owner only their own rows, so the wire carries no count and no
// names of who else is in. That is the same ruling as free agency's contested flag, and
// it is enforced by the database rather than by anything here.
//
// THE DATABASE DECIDES WHETHER THE WIRE IS OPEN. edfl_wire_live() is the only thing this
// page asks; there is no calendar comparison and no clock here.
//
// PHASE 2D-2 (September 18 2026, ET): the chrome moved onto the kit. Breadcrumbs instead
// of a bare "Home" link, the market eyebrow, and the run notice folded into the lead card
// the board now draws -- one statement of when the run is, not two that could disagree.
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

  // The run's day, read off runs_at in Eastern rather than written as a constant: a run
  // that ever moved off a Wednesday midnight would otherwise be labelled with the old
  // day. Server component, so this never hydrates.
  const runWeekday = nextRun
    ? new Date(nextRun.runs_at).toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: EASTERN_TIME_ZONE,
      })
    : null;

  // THE CLOCK, HANDED DOWN RATHER THAN READ TWICE. The board's countdown seeds its state
  // from this instant, so the server's HTML and the browser's first paint are the same
  // string and there is nothing for React to reconcile. The board replaces it with the
  // browser's own clock on mount. revalidate = 0, so this is genuinely the instant the
  // reader's request was served.
  const nowIso = new Date().toISOString();

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Waiver Wire' }]} />

      <p className="eyebrow">
        {leagueName} &middot; Market
      </p>
      <h1>Waiver Wire</h1>

      {!state.ok && <div className="form-error">{state.message}</div>}

      {state.ok && !live && (
        <p className="empty-note">
          {'The waiver wire is not open yet. It opens with the ' + season + ' season.'}
        </p>
      )}

      {live && (
        <>
          <p className="subhead">
            Players cut in-season sit on the wire until the next run. Claim any of them;
            claims are tried in the order you set, and nobody sees another owner&apos;s
            claims until the run has executed.
          </p>

          <WaiverBoard
            signedIn={state.data.signedIn}
            teamId={state.data.teamId}
            nextRun={nextRun}
            runWeekday={runWeekday}
            nowIso={nowIso}
            priority={state.data.priority}
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

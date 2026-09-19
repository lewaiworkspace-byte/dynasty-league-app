import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { loadPoachingState } from './actions';
import PoachingBoard from './PoachingBoard';
import Breadcrumbs from '../../components/Breadcrumbs';

// A poach window closes on a wall clock and the board is sealed per viewer --
// never cache.
export const revalidate = 0;
export const metadata = { title: 'Poaching' };

// POACHING -- RULE 5.17. Phase 2D-3, September 19 2026 (ET).
//
// A NEW ROUTE, AND WHY. Until today this was a section inside
// /free-agency's board: a practice-squad table under the free agency pool,
// drawn only while the market was open, plus a poach path threaded through the
// shared offer form. The approved artboard makes it a screen, and the reading
// is better for it -- the first question a poaching screen answers is "who of
// mine is exposed", which a section at the bottom of another market's page
// could never lead with.
//
// LOGIN-GATED, NOT OFFICER-GATED. Any owner may bid on any other team's
// practice squad player, and the holding team may bid to keep him. There is no
// officer control on this screen at all: R-1 puts Preview and Resolve on the
// board that holds the offers, and a poach window sits on /free-agency's board
// with every other live window.
//
// THE REDIRECT IS THE SECOND LINE, NOT THE FIRST. middleware.js closes every
// route but /login, /auth/callback and /api/cron/*, so a new route is shut by
// default and this page could carry no gate at all. It carries one anyway --
// belt and braces, the same as the other thirty (CLAUDE.md).
//
// NOTHING ON THIS PAGE DECIDES WHETHER POACHING IS OPEN. poachable_players
// carries the calendar test as its own flag and the 5.17 calendar row carries
// is_past; both are evaluated in the database at query time. There is no clock
// comparison here and there must not be one.
export default async function PoachingPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/poaching');

  const [{ data: config }, state] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    loadPoachingState(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  // THE CLOCK, HANDED DOWN RATHER THAN READ TWICE. The instant the server
  // rendered the page seeds the board's clock state, so the server's HTML and
  // the browser's first paint are the same string and there is nothing for
  // React to reconcile. The board replaces it with the browser's own on mount.
  // revalidate = 0, so this is genuinely the instant the reader's request was
  // served. The 2D-2 pattern.
  const nowIso = new Date().toISOString();

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Poaching' }]} />

      <p className="eyebrow">
        {leagueName} &middot; Market &middot; Rule 5.17
      </p>
      <h1>Poaching</h1>

      {!state.ok && <div className="form-error">{state.message}</div>}

      {state.ok && (
        <>
          <p className="subhead">
            A bid on another team&apos;s practice squad player opens a sealed 24-hour window that
            any team may bid into, including the team that holds him. A poach bid is an active
            roster contract, and a tie goes to the team that holds him.
          </p>

          <PoachingBoard
            season={season}
            nowIso={nowIso}
            squads={state.data.squads}
            poachingOpen={state.data.poachingOpen}
            opensAt={state.data.opensAt}
            closesAt={state.data.closesAt}
            windowHasOpened={state.data.windowHasOpened}
            windows={state.data.windows}
            myOffers={state.data.myOffers}
            myTeamId={state.data.teamId}
            weightRows={state.data.weightRows}
            wireLive={state.data.wireLive}
          />
        </>
      )}
    </main>
  );
}

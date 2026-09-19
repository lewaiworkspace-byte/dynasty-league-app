import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { formatDate, formatDateTime } from '../../lib/formatDate';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { loadFreeAgencyState } from './actions';
import FreeAgencyBoard from './FreeAgencyBoard';
import Breadcrumbs from '../../components/Breadcrumbs';

// Windows close on a wall clock and the board is sealed per viewer -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Free agency' };

// IN-SEASON FREE AGENCY.
//
// LOGIN-GATED, NOT OFFICER-GATED. Any owner may open a window and offer into
// one. Only Resolve is the commissioner's (FA-8), and the database gates that
// independently.
//
// WHY THIS PAGE SHOWS SO LITTLE DURING A WINDOW. FA-3: nobody sees any offer's
// terms or who made them until the window resolves -- including the
// commissioner. The board shows a contested flag and nothing else,
// deliberately: FA-D ruled that even a COUNT leaks too much in a ten-team
// league. RLS on free_agent_offers is what actually enforces this, so there is
// nothing here that could accidentally widen it.
//
// POACHING LEFT THIS PAGE IN 2D-3 (September 19 2026, ET). It is /poaching
// now, per the approved artboards, and the board below still lists a live
// poach window with every other one -- a poach window IS a free agency window.
// What moved is the practice-squad list and the bid's entry point, which
// belong with the screen that answers "who is exposed".
//
// THE TITLE IS "Free agency" AGAIN, not "Free agency and poaching".
export default async function FreeAgencyPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/free-agency');

  const [{ data: config }, state] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    loadFreeAgencyState(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  // When free agency opens, and when it shuts. 5.14(a) is published only when
  // the commissioner has opened the market early; otherwise the In-Season
  // boundary governs.
  const { data: marks } = await supabase
    .from('league_calendar_events')
    .select('rule_ref, starts_at, title')
    .eq('season_year', season)
    .in('rule_ref', ['5.14(a)', '1.4(c)', '9.1(b)'])
    .order('starts_at', { ascending: true });

  const rows = marks || [];
  const pick = function (ref) {
    const hit = rows.find(function (r) { return r.rule_ref === ref; });
    return hit ? hit.starts_at : null;
  };
  const opensAt = pick('5.14(a)') || pick('1.4(c)');
  const closesAt = pick('9.1(b)');
  const earlyOpen = Boolean(pick('5.14(a)'));
  const isOpen = Boolean(opensAt) && new Date(opensAt).getTime() <= Date.now()
    && (!closesAt || new Date(closesAt).getTime() > Date.now());

  // THE CLOCK, HANDED DOWN RATHER THAN READ TWICE. The instant the server
  // rendered the page seeds the board's clock state, so the server's HTML and
  // the browser's first paint are the same string and there is nothing for
  // React to reconcile. A server component reading Date.now() is correct --
  // it never hydrates (CLAUDE.md). revalidate = 0, so this is genuinely the
  // instant the reader's request was served.
  const nowIso = new Date().toISOString();

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Free Agency' }]} />

      <p className="eyebrow">
        {leagueName} &middot; Market &middot; {season}
      </p>
      <h1>Free Agency</h1>
      <p className="subhead">
        Offer on any player nobody holds a contract on. The first offer starts a 24-hour
        window; anyone may offer into it until it closes. Highest total PPV wins, and the
        earliest offer breaks a tie. Nobody sees another owner&apos;s terms, or who opened the
        window, until it is resolved. An offer cannot be withdrawn or lowered &mdash; you may
        only replace it with a higher one before the window closes (Rule 5.14(d)).
      </p>

      {!state.ok && <div className="form-error">{state.message}</div>}

      {state.ok && !isOpen && (
        <p className="empty-note">
          Free agency is not open.
          {opensAt
            ? ' It opens ' + formatDateTime(opensAt) + '.'
            : ''}
        </p>
      )}

      {state.ok && isOpen && earlyOpen && (
        <p className="form-notice">
          Free agency was opened early for {season} as a one-time league-startup measure. The
          in-season rules apply exactly as written &mdash; the only thing that moved is the door.
        </p>
      )}

      {/*
        Gated on the database's own is_past, not on a clock here -- the same
        boolean that decides whether the board draws its FIRST OFFER WINS tags,
        so the notice and the tags cannot disagree. Fails closed with them.
      */}
      {state.ok && isOpen && state.data.firstOfferExemptionActive && state.data.firstOfferUntil && (
        <p className="form-notice">
          Until midnight ET on{' '}
          {formatDate(state.data.firstOfferUntil)}, a player who has never held an EDFL
          contract is exempt from the 24-hour window:
          the first valid offer signs him on the spot. Players who have held a contract go to
          a window as normal.
        </p>
      )}

      {state.ok && (
        <FreeAgencyBoard
          season={season}
          nowIso={nowIso}
          firstOfferUntil={state.data.firstOfferUntil}
          firstOfferExemptionActive={state.data.firstOfferExemptionActive}
          board={state.data.board}
          resolved={state.data.resolved}
          myOffers={state.data.myOffers}
          myTeamId={state.data.teamId}
          wireLive={state.data.wireLive}
          canResolve={state.data.canResolve}
          isOpen={isOpen}
          pool={state.data.pool}
          poolTotal={state.data.poolTotal}
          weightRows={state.data.weightRows}
        />
      )}
    </main>
  );
}

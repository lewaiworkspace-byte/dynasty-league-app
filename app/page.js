import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED } from '../lib/featureFlags';
import OfficerActionBanner from '../components/OfficerActionBanner';

// Always fetch fresh data -- team names/rosters can change
export const revalidate = 0;

export default async function HomePage() {
  const [{ data: teams, error: teamsError }, { data: config }, teamOwner] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('league_config').select('league_short_name, current_season_year').eq('id', true).single(),
    getCurrentTeamOwner(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';
  // Read, never written in: this eyebrow said 2026 as a literal until
  // September 16, 2026. A failed config read drops the year rather than guess it.
  const seasonLabel = config && config.current_season_year ? ' · ' + config.current_season_year : '';

  // Computed once, read twice below. isCommish is the STRICT test and is
  // deliberately not the helper -- see lib/getCurrentTeamOwner.js.
  const canAdmin = isCommissionerOrCo(teamOwner);
  const isCommish = Boolean(teamOwner && teamOwner.is_commissioner);

  // OFFICER ACTION BANNER. Asked for only when canAdmin -- that decides whether
  // to ASK, not what may be seen: officer_action_items() refuses a non-officer
  // on its own. It runs through the SESSION client because the function gates
  // on auth.uid(), which is null through the service-role client. A failed
  // read is passed to the banner as an error so it says "could not check"
  // rather than "all clear".
  let actionItems = null;
  let actionItemsError = null;
  if (canAdmin) {
    const sessionClient = await createSupabaseServerClient();
    const { data, error } = await sessionClient.rpc('officer_action_items');
    actionItems = data || [];
    actionItemsError = error ? error.message : null;
  }

  return (
    <main className="page">
      <p className="eyebrow">{leagueName}{seasonLabel}</p>
      <h1>Home</h1>
      <p className="subhead">Quick links to everything in the app.</p>

      {canAdmin && <OfficerActionBanner items={actionItems} error={actionItemsError} />}

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">League</h2>
        <div className="page-actions">
          <a href="/cap-sheet" className="btn">
            Cap Sheet
          </a>
          <a href="/calendar" className="btn">
            League Calendar
          </a>
          <a href="/scoreboard" className="btn">
            Scoreboard
          </a>
          <a href="/standings" className="btn">
            Standings
          </a>
          {/*
            A League surface: every signed-in owner searches the same player
            pool and gets the same rows back. teamOwner-gated because /search
            redirects a signed-out visitor to /login, and because
            search_players() had its anon grant revoked on September 8 2026 --
            a link drawn for a signed-out visitor could only bounce.

            The app bar carries a search box on every route as well. Both reach
            the same page; this one is here because the home page is where an
            owner looks for a list of what the app can do.
          */}
          {teamOwner && (
            <a href="/search" className="btn">
              Player Search
            </a>
          )}
          <a href="/bids" className="btn">
            Blind Bid Auction
          </a>
          {/*
            OUTSIDE the Admin block, like Restructure and the Fifth Year Option. In-season
            free agency is an owner action: any owner may open a window on any unsigned
            player and offer into anyone else's. Only Resolve belongs to the commissioner,
            and that button lives on the page itself, drawn from the same two-tier test
            used here -- not from this link.

            teamOwner-gated because /free-agency redirects a signed-out visitor to /login,
            and a link that always bounces is the exact failure the Admin comment below
            describes.
          */}
          {teamOwner && (
            <a href="/free-agency" className="btn">
              Free Agency &amp; Poaching
            </a>
          )}
          {/*
            teamOwner-gated for the same reason: /league-finances redirects a signed-out
            visitor to /login (PF-3 -- every owner sees it, the public does not).
          */}
          {teamOwner && (
            <a href="/league-finances" className="btn">
              League Finances
            </a>
          )}
          {/*
            NOT teamOwner-gated, and that is deliberate. /waivers is public the way the
            Scoreboard is: a signed-out reader gets the wire and the last run, and only
            the claim controls need a session -- gated on the page and, for real, in the
            database. The page never bounces, so the link is drawn for everybody.
          */}
          <a href="/waivers" className="btn">
            Waiver Wire
          </a>
          <a href="/trades" className="btn">
            Trades
          </a>
          <a href="/stats" className="btn">
            Historical Stats
          </a>
          <a href="/actions" className="btn">
            Commissioner Action Log
          </a>
          {teamOwner && (
            <a href="/values" className="btn">
              Player Value Chart
            </a>
          )}
          {/*
            OUTSIDE the Admin block on purpose. Restructure opened to every
            owner on September 4, 2026 -- an owner restructures on their own
            roster and the commissioner may act for any team. Putting this link
            inside canAdmin would hide the feature from exactly the people the
            rule change was for.

            Also behind the kill switch: while RESTRUCTURE_ENABLED is false the
            link is not drawn at all. That is presentation only -- the actions
            refuse independently, which is what actually switches it off.
          */}
          {teamOwner && RESTRUCTURE_ENABLED && (
            <a href="/restructure" className="btn">
              Restructure Contract
            </a>
          )}
          {/*
            OUTSIDE the Admin block, for the same reason Restructure is. Rule
            5.9 gives the option decision to the owner whose roster the player
            is on, not to the commissioner -- so this is a League surface and
            every owner gets the link. The board shows the whole league; who
            may ACT on a row is decided in the database, per row.
          */}
          {teamOwner && (
            <a href="/fifth-year-option" className="btn">
              Fifth Year Option
            </a>
          )}
          {/*
            A League surface: every member sees the same log in the same order.
            The database grant is to authenticated and the log carries no
            per-viewer branch, so there is nothing here that differs by owner.
          */}
          {teamOwner && (
            <a href="/transactions" className="btn">
              Transactions
            </a>
          )}
          {/*
            A League surface for the same reason Transactions is: every member
            sees the same rows in the same order, and the view is granted to
            authenticated only. teamOwner-gated because /injury-report bounces a
            signed-out visitor to /login, and a link that always bounces is the
            failure the Admin comment below describes.

            OUTSIDE the Admin block deliberately. Only the PULL belongs to the
            officers; reading the report belongs to everybody, and putting the
            link inside canAdmin would hide the feature from the people it is
            for.
          */}
          {teamOwner && (
            <a href="/injury-report" className="btn">
              Injury Report
            </a>
          )}
          {/*
            A League surface, and teamOwner-gated for a database reason rather
            than a policy one. draft_pick_board has no anon grant at all -- it
            reads player_transaction_feed, which calls the Class B function
            winning_bid_link -- so a signed-out visitor cannot read the board
            and a link drawn for them could only fail. Reading the board belongs
            to every owner; nothing on it is team-private and nothing on it
            writes.
          */}
          {teamOwner && (
            <a href="/draft-picks" className="btn">
              Draft Picks
            </a>
          )}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">Teams</h2>
        {teamsError && <p className="empty-note">Couldn&apos;t load teams: {teamsError.message}</p>}
        {!teamsError && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
              marginTop: 12,
            }}
          >
            {(teams || []).map((t) => (
              <a key={t.id} href={'/team/' + t.id} className="btn" style={{ textAlign: 'center' }}>
                {t.name || 'Unclaimed Team'}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ADMIN SECTION -- RENDERED ONLY FOR THOSE WHO CAN USE IT.
          Until August 30, 2026 every button below was drawn for every logged-in
          owner, and only the destination page turned them away. An owner who
          clicked one landed back here with no explanation and reasonably
          concluded the app was broken.

          The gate here decides what is DRAWN. It is not access control -- each
          page still redirects and each Server Action still re-checks, and those
          remain the real gates. Hiding a link protects nobody; it only stops
          showing people doors they cannot open.

          TWO TIERS, matching lib/getCurrentTeamOwner.js exactly:
            canAdmin  -- isCommissionerOrCo -- the widened set
            isCommish -- teamOwner.is_commissioner -- STRICT, never the helper
          Sync Players and Import Stats are canAdmin since September 16, 2026,
          widened in the same commit as their pages and actions (the ruling of
          September 8 that struck Technical Manual Appendix A.2(c)). The Calendar
          Loader is the one strict link left here. */}
      {canAdmin && (
        <section style={{ marginTop: 32 }}>
          <h2 className="section-heading">Admin</h2>
          <div className="page-actions">
            <a href="/admin/new-contract" className="btn">
              + New Contract
            </a>
            {/*
              canAdmin since September 16, 2026 (Appendix A.2(c) struck September 8).
              Both pages write through the service-role client, so their own
              Server Action checks are the whole gate -- those widened with this.
            */}
            <a href="/admin/sync-players" className="btn">
              Sync Players
            </a>
            <a href="/admin/import-stats" className="btn">
              Import Stats &amp; Publish Results
            </a>
            <a href="/admin/new-tier" className="btn">
              Build FA Tier
            </a>
            <a href="/admin/tier-results" className="btn">
              Tier Results
            </a>
            <a href="/admin/fix-contracts" className="btn">
              Fix Contracts
            </a>
            <a href="/admin/cash" className="btn">
              Manage Owner Cash
            </a>
            <a href="/admin/owner-activity" className="btn">
              Owner Administration
            </a>
            <a href="/admin/cuts" className="btn">
              Cuts &amp; Roster Moves
            </a>
            <a href="/admin/trades" className="btn">
              Trade Approvals
            </a>
            <a href="/admin/restructure" className="btn">
              Restructure (any team)
            </a>
            <a href="/admin/fifth-year-option" className="btn">
              Option Reversals
            </a>
            <a href="/admin/sleeper-sync" className="btn">
              Sleeper Sync
            </a>
            {/*
              isCommish, NOT canAdmin. The calendar loader is new and nobody has
              widened it, so it is strict by the default-DENY rule in
              lib/getCurrentTeamOwner.js -- and the database agrees: every
              calendar_* write calls require_commissioner(). If it is ever
              widened, widen the page, the actions and those functions in the
              same change.
            */}
            {isCommish && (
              <a href="/admin/calendar" className="btn">
                Calendar Loader
              </a>
            )}
            {/*
              canAdmin, NOT isCommish. Widened to the co-commissioner on the
              commissioner's instruction of September 8 2026 -- see the block
              comment in app/admin/injury-sync/actions.js. Unlike Sync Players,
              this pull cannot insert a player row.
            */}
            <a href="/admin/injury-sync" className="btn">
              Injury Sync
            </a>
          </div>
          <p className="empty-note">
            {isCommish
              ? 'Commissioner tools. The Calendar Loader and appointing a co-commissioner are yours alone; everything else here is shared with the co-commissioner.'
              : 'Co-commissioner tools. The Calendar Loader, publishing the Player Value Chart, appointing a co-commissioner and vetoing a trade for competitive balance are withheld from this role.'}
          </p>
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">Account</h2>
        <div className="page-actions">
          <a href="/login" className="btn">
            Login
          </a>
          <a href="/cash" className="btn">
            My Cash Account
          </a>
        </div>
      </section>
    </main>
  );
}

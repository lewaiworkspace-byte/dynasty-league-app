import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED } from '../lib/featureFlags';

// Always fetch fresh data -- team names/rosters can change
export const revalidate = 0;

export default async function HomePage() {
  const [{ data: teams, error: teamsError }, { data: config }, teamOwner] = await Promise.all([
    supabase.from('teams').select('id, name, abbrev').order('name'),
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

  // The officer action banner and the thirteen Admin buttons that used to sit
  // on this page both moved to the Commissioner Portal on September 17, 2026.
  // That took officer_action_items() -- which REFRESHES the state table on every
  // call -- off every home page load for the two officers. The app bar's pill
  // reads officer_action_badge() instead: two integers, no refresh, no titles.

  return (
    <main className="page">
      <p className="eyebrow">{leagueName}{seasonLabel}</p>
      <h1>Home</h1>
      <p className="subhead">Quick links to everything in the app.</p>


      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">League</h2>
        <div className="page-actions kit-navgrid">
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
        {/* Ten identical buttons in a grid until September 17, 2026. Rows carry
            the trigraph and mark the viewer's own team, which a button wall
            could not do without becoming a wall of longer buttons. */}
        {!teamsError && (
          <div className="kit-rows">
            {(teams || []).map(function (t) {
              const isMine = Boolean(teamOwner && teamOwner.team_id === t.id);
              return (
                <a className="kit-row" href={'/team/' + t.id} key={t.id}>
                  {/* teams.abbrev is set for all ten and is unique. A team added
                      without one renders an empty disc rather than a guess --
                      never derive a trigraph from the name here. */}
                  <span
                    className={isMine ? 'kit-disc kit-disc-own' : 'kit-disc'}
                    aria-hidden="true"
                  >
                    {t.abbrev || ''}
                  </span>
                  <div className="kit-row-main">
                    <div className="kit-row-title">{t.name || 'Unclaimed Team'}</div>
                    {isMine ? <div className="kit-row-meta">Your team</div> : null}
                  </div>
                  <span className="kit-row-right" aria-hidden="true">
                    &rsaquo;
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* THE ADMIN SECTION IS GONE. September 17, 2026.

          Thirteen buttons with no descriptions used to sit here, under the
          league's own links, drawn only for an officer. They are now the
          Commissioner Portal at /admin, reached from the pill in the app bar --
          which is the only door to it and which owners never see.

          ONE LINK IS LEFT, and deliberately: the pill is new, and an officer who
          has not noticed it yet should not have to hunt for the tools that were
          on this page yesterday. It can come out once the portal is familiar.

          The gate is unchanged and still decides only what is DRAWN. Every
          /admin page redirects on its own and every Server Action re-checks. */}
      {canAdmin && (
        <section style={{ marginTop: 32 }}>
          <h2 className="section-heading">Commissioner</h2>
          <div className="page-actions">
            <a href="/admin" className="btn kit-cta">
              Commissioner Portal
            </a>
          </div>
          <p className="empty-note">
            {isCommish
              ? 'Every commissioner tool now lives in the portal, with your action items at the top. The Calendar Loader and appointing a co-commissioner are yours alone.'
              : 'Every co-commissioner tool now lives in the portal, with the action items at the top. The Calendar Loader, publishing the Player Value Chart, appointing a co-commissioner and vetoing a trade are withheld from this role.'}
          </p>
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">Account</h2>
        <div className="page-actions kit-navgrid">
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

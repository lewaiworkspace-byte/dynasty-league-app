import { supabase } from '../lib/supabaseClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED } from '../lib/featureFlags';

// Always fetch fresh data -- team names/rosters can change
export const revalidate = 0;

export default async function HomePage() {
  const [{ data: teams, error: teamsError }, { data: config }, teamOwner] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('league_config').select('league_short_name').eq('id', true).single(),
    getCurrentTeamOwner(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  // Computed once, read twice below. isCommish is the STRICT test and is
  // deliberately not the helper -- see lib/getCurrentTeamOwner.js.
  const canAdmin = isCommissionerOrCo(teamOwner);
  const isCommish = Boolean(teamOwner && teamOwner.is_commissioner);

  return (
    <main className="page">
      <p className="eyebrow">{leagueName} · 2026</p>
      <h1>Home</h1>
      <p className="subhead">Quick links to everything in the app.</p>

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">League</h2>
        <div className="page-actions">
          <a href="/cap-sheet" className="btn">
            Cap Sheet
          </a>
          <a href="/calendar" className="btn">
            League Calendar
          </a>
          <a href="/bids" className="btn">
            Blind Bid Auction
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
          Sync Players is strict because /admin/sync-players is strict. If that
          page's gate ever widens, widen this one in the same commit, not
          before. */}
      {canAdmin && (
        <section style={{ marginTop: 32 }}>
          <h2 className="section-heading">Admin</h2>
          <div className="page-actions">
            <a href="/admin/new-contract" className="btn">
              + New Contract
            </a>
            {isCommish && (
              <a href="/admin/sync-players" className="btn">
                Sync Players
              </a>
            )}
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
              Cuts
            </a>
          </div>
          <p className="empty-note">
            {isCommish
              ? 'Commissioner tools. Sync Players and appointing a co-commissioner are yours alone; everything else here is shared with the co-commissioner.'
              : 'Co-commissioner tools. Sync Players, importing stats, publishing the Player Value Chart, and appointing a co-commissioner are withheld from this role under Appendix A.'}
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

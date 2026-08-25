import { supabase } from '../lib/supabaseClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../lib/getCurrentTeamOwner';

// Always fetch fresh data -- team names/rosters can change
export const revalidate = 0;

export default async function HomePage() {
  const [{ data: teams, error: teamsError }, { data: config }, teamOwner] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('league_config').select('league_short_name').eq('id', true).single(),
    getCurrentTeamOwner(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

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

      <section style={{ marginTop: 32 }}>
        <h2 className="section-heading">Admin</h2>
        <div className="page-actions">
          <a href="/admin/new-contract" className="btn">
            + New Contract
          </a>
          <a href="/admin/sync-players" className="btn">
            Sync Players
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
            Owner Login Activity
          </a>
          {isCommissionerOrCo(teamOwner) && (
            <a href="/admin/cuts" className="btn">
              Cuts
            </a>
          )}
        </div>
        <p className="empty-note">
          Sync Players and Owner Login Activity are commissioner-only. The rest
          are open to the commissioner and co-commissioners; each page turns
          everyone else away.
        </p>
      </section>

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

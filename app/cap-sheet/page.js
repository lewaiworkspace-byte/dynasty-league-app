import { supabase } from '../../lib/supabaseClient';

// Always fetch fresh data -- cap numbers should never be cached/stale
export const revalidate = 0;

export async function generateMetadata() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .single();

  const leagueName = config?.league_short_name || 'Dynasty League';

  return {
    title: `${leagueName} — Cap Sheet`,
  };
}

function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString()}`;
}

export default async function CapSheetPage() {
  const [{ data: teams, error }, { data: config }, { data: cashRows }] = await Promise.all([
    supabase.from('team_cap_summary').select('*').order('team_name'),
    supabase.from('league_config').select('league_short_name').eq('id', true).single(),
    // Filtered to match app/cash/page.js and app/admin/cash/page.js, both of
    // which key team_cash_available by season_year -- an unfiltered select
    // here would pull every season's row per team once a second season
    // exists, and the Map below would silently keep whichever one happened
    // to come back last. Hardcoded to 2026 like those two pages; worth
    // revisiting at rollover (see CLAUDE.md).
    supabase.from('team_cash_available').select('team_id, cash_available').eq('season_year', 2026),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  // team_id -> remaining cash. Not every team necessarily has a cash-budget
  // row yet (one team's is still unset), so a missing entry renders as "—".
  const cashByTeam = new Map((cashRows || []).map((r) => [r.team_id, r.cash_available]));

  if (error) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          ← Home
        </a>
        <p className="eyebrow">{leagueName} · 2026</p>
        <h1>Cap Sheet</h1>
        <p className="subhead">Couldn&apos;t load team data: {error.message}</p>
      </main>
    );
  }

  const allEmpty = teams.every((t) => Number(t.cap_used) === 0);

  return (
    <main className="page">
      <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
        ← Home
      </a>
      <p className="eyebrow">{leagueName} · 2026</p>
      <h1>Cap Sheet</h1>
      <p className="subhead">Salary cap standing across all 10 teams.</p>

      <div className="page-actions">
        <a href="/admin/new-contract" className="btn">
          + New Contract
        </a>
      </div>

      <table className="ledger">
        <thead>
          <tr>
            <th>Team</th>
            <th style={{ textAlign: 'right' }}>Cap Used</th>
            <th style={{ textAlign: 'right' }}>Cap Space</th>
            <th style={{ textAlign: 'right' }}>Min Spend</th>
            <th style={{ textAlign: 'right' }}>Cash Spent</th>
            <th style={{ textAlign: 'right' }}>Cash Remaining</th>
            <th>Cap Room</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const cap = Number(t.fantasy_salary_cap) || 0;
            const used = Number(t.cap_used) || 0;
            const pctUsed = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
            const over = Number(t.cap_space_remaining) < 0;
            const cashRemaining = cashByTeam.get(t.team_id);
            const hasCash = cashRemaining !== undefined && cashRemaining !== null;
            return (
              <tr key={t.team_id}>
                <td className="team-name">
                  <a href={`/team/${t.team_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {t.team_name}
                  </a>
                </td>
                <td className="num">{formatMoney(t.cap_used)}</td>
                <td className={`num ${over ? 'negative' : 'positive'}`}>
                  {formatMoney(t.cap_space_remaining)}
                </td>
                <td className="num">{formatMoney(t.min_required_spend)}</td>
                <td className="num">{formatMoney(t.total_cash_spent)}</td>
                <td className={`num ${hasCash ? 'positive' : ''}`}>
                  {hasCash ? formatMoney(cashRemaining) : '—'}
                </td>
                <td>
                  <div className="cap-meter">
                    <div
                      className={`cap-meter-fill ${over ? 'over' : ''}`}
                      style={{ width: `${pctUsed}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {allEmpty && (
        <p className="empty-note">
          No contracts entered yet — every team is showing full cap space.
          This fills in as contracts get added.
        </p>
      )}
    </main>
  );
}

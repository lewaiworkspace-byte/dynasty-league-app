import { supabase } from '../lib/supabaseClient';

// Always fetch fresh data -- cap numbers should never be cached/stale
export const revalidate = 0;

function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString()}`;
}

export default async function HomePage() {
  const { data: teams, error } = await supabase
    .from('team_cap_summary')
    .select('*')
    .order('team_name');

  if (error) {
    return (
      <main className="page">
        <p className="eyebrow">Dynasty League · 2026</p>
        <h1>Cap Sheet</h1>
        <p className="subhead">
          Couldn&apos;t load team data: {error.message}
        </p>
      </main>
    );
  }

  const allEmpty = teams.every((t) => Number(t.cap_used) === 0);

  return (
    <main className="page">
      <p className="eyebrow">Dynasty League · 2026</p>
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
            <th>Cap Room</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const cap = Number(t.fantasy_salary_cap) || 0;
            const used = Number(t.cap_used) || 0;
            const pctUsed = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
            const over = Number(t.cap_space_remaining) < 0;
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

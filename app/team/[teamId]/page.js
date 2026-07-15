import { supabase } from '../../../lib/supabaseClient';

export const revalidate = 0;

const CONTRACT_TYPE_LABELS = {
  rookie: 'Rookie',
  fifth_year_option: '5th Year Option',
  veteran_free_agent: 'Veteran Free Agent',
  practice_squad: 'Practice Squad',
  franchise_tag_exclusive: 'Franchise Tag (Exclusive)',
  franchise_tag_non_exclusive: 'Franchise Tag (Non-Exclusive)',
  transition_tag: 'Transition Tag',
};

function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString()}`;
}

export default async function TeamPage({ params }) {
  const { teamId } = params;

  const [{ data: team, error: teamErr }, { data: config }, { data: summaryRows }] = await Promise.all([
    supabase.from('teams').select('id, name').eq('id', teamId).single(),
    supabase.from('league_config').select('current_season_year').eq('id', true).single(),
    supabase.from('team_cap_summary').select('*').eq('team_id', teamId),
  ]);

  if (teamErr || !team) {
    return (
      <main className="page">
        <p className="eyebrow">Dynasty League</p>
        <h1>Team Not Found</h1>
        <p className="subhead">
          <a href="/">&larr; Back to Cap Sheet</a>
        </p>
      </main>
    );
  }

  const currentSeasonYear = config?.current_season_year || 2026;
  const summary = (summaryRows || []).find((r) => r.league_season_year === currentSeasonYear);

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, contract_type, status, start_year, total_years, void_years, players(full_name, position, nfl_team)')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('start_year');

  const contractIds = (contracts || []).map((c) => c.id);

  let yearRows = [];
  if (contractIds.length > 0) {
    const { data } = await supabase
      .from('contract_year_computed')
      .select('contract_id, league_season_year, ppv, cap_charge, dead_cap_if_cut, is_void_year')
      .in('contract_id', contractIds)
      .eq('league_season_year', currentSeasonYear);
    yearRows = data || [];
  }

  const rows = (contracts || [])
    .map((c) => {
      const yr = yearRows.find((y) => y.contract_id === c.id);
      const totalSpan = c.total_years + (c.void_years || 0);
      const currentYearNumber = currentSeasonYear - c.start_year + 1;
      return {
        ...c,
        player: c.players,
        yearInDeal: currentYearNumber,
        totalSpan,
        ppv: yr?.ppv ?? null,
        capCharge: yr?.cap_charge ?? null,
        deadCap: yr?.dead_cap_if_cut ?? null,
        isVoidYear: yr?.is_void_year ?? false,
      };
    })
    // Only show contracts that actually cover the current season
    .filter((c) => c.yearInDeal >= 1 && c.yearInDeal <= c.totalSpan);

  return (
    <main className="page">
      <p className="eyebrow">Dynasty League · {currentSeasonYear}</p>
      <h1>{team.name}</h1>
      <p className="subhead">
        <a href="/">&larr; Back to Cap Sheet</a>
      </p>

      {summary && (
        <div className="stat-strip">
          <div className="stat">
            <div className="stat-label">Cap Used</div>
            <div className="stat-value">{formatMoney(summary.cap_used)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Cap Space</div>
            <div className="stat-value positive">{formatMoney(summary.cap_space_remaining)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Min Spend</div>
            <div className="stat-value">{formatMoney(summary.min_required_spend)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Cash Spent</div>
            <div className="stat-value">{formatMoney(summary.total_cash_spent)}</div>
          </div>
        </div>
      )}

      <div className="page-actions">
        <a href="/admin/new-contract" className="btn">
          + New Contract
        </a>
      </div>

      <table className="ledger">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Type</th>
            <th>Contract</th>
            <th style={{ textAlign: 'right' }}>PPV</th>
            <th style={{ textAlign: 'right' }}>Cap Hit</th>
            <th style={{ textAlign: 'right' }}>Dead Cap If Cut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="team-name">
                {c.player?.full_name || 'Unknown Player'}
                {c.isVoidYear && <span className="void-tag"> VOID YR</span>}
              </td>
              <td>{c.player?.position || '—'}</td>
              <td>{CONTRACT_TYPE_LABELS[c.contract_type] || c.contract_type}</td>
              <td>
                {c.start_year}
                {c.totalSpan > 1 ? `–${c.start_year + c.totalSpan - 1}` : ''}
                <span className="empty-note" style={{ marginLeft: 6 }}>
                  (Yr {c.yearInDeal}/{c.totalSpan})
                </span>
              </td>
              <td className="num">{c.ppv !== null ? formatMoney(c.ppv) : '—'}</td>
              <td className="num">{c.capCharge !== null ? formatMoney(c.capCharge) : '—'}</td>
              <td className="num negative">{c.deadCap !== null ? formatMoney(c.deadCap) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="empty-note">No active contracts for {currentSeasonYear} yet.</p>
      )}
    </main>
  );
}

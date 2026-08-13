import { supabase } from '../../lib/supabaseClient';

// Always fetch fresh data -- cap numbers should never be cached/stale
export const revalidate = 0;

// Fallback only, for the case where league_config can't be read. Every
// other season reference on this page derives from current_season_year.
const FALLBACK_SEASON = 2026;

async function loadSeasonContext() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name, current_season_year')
    .eq('id', true)
    .single();

  return {
    leagueName: (config && config.league_short_name) || 'Dynasty League',
    seasonYear: (config && Number(config.current_season_year)) || FALLBACK_SEASON,
  };
}

export async function generateMetadata() {
  const ctx = await loadSeasonContext();
  return {
    title: ctx.leagueName + ' — Cap Sheet',
  };
}

function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString();
}

export default async function CapSheetPage() {
  // The season has to be resolved BEFORE the queries below, because all
  // three of them filter on it. Two round trips instead of one, deliberately.
  const ctx = await loadSeasonContext();
  const leagueName = ctx.leagueName;
  const seasonYear = ctx.seasonYear;

  const [{ data: teams, error }, { data: cashRows }, { data: capRow }] = await Promise.all([
    // FILTERED BY SEASON. team_cap_summary is teams CROSS JOIN
    // league_cap_settings, so it returns one row per team PER SEASON -- an
    // unfiltered select renders every team twice the moment a second cap
    // row exists, and key={t.team_id} collides on the duplicates.
    //
    // Note what does NOT fire this: contract data. The view takes its
    // seasons from league_cap_settings, not from contract_years, so
    // charges sitting in 2031-2034 have never affected its row count. Only
    // a new cap-settings row does. That distinction was mis-stated twice
    // during the Aug 12-13 audits; it is settled by observation -- the view
    // returned 10 rows for one season while those charges already existed.
    supabase
      .from('team_cap_summary')
      .select('*')
      .eq('league_season_year', seasonYear)
      .order('team_name'),

    // Keyed by season for the same reason, matching app/cash/page.js and
    // app/admin/cash/page.js. No longer hardcoded to 2026.
    supabase
      .from('team_cash_available')
      .select('team_id, cash_available')
      .eq('season_year', seasonYear),

    // A season's cap may be an estimate entered before the league year
    // opens. The flag lives on the row rather than in this file so every
    // surface rendering a season can ask the data whether to label it.
    supabase
      .from('league_cap_settings')
      .select('season_year, is_provisional')
      .eq('season_year', seasonYear)
      .maybeSingle(),
  ]);

  const isProvisional = Boolean(capRow && capRow.is_provisional);

  // team_id -> remaining cash. Not every team necessarily has a cash-budget
  // row yet (one team's is still unset), so a missing entry renders as "—".
  const cashByTeam = new Map((cashRows || []).map((r) => [r.team_id, r.cash_available]));

  if (error) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          ← Home
        </a>
        <p className="eyebrow">{leagueName} · {seasonYear}</p>
        <h1>Cap Sheet</h1>
        <p className="subhead">Couldn&apos;t load team data: {error.message}</p>
      </main>
    );
  }

  const rows = teams || [];
  const allEmpty = rows.length > 0 && rows.every((t) => Number(t.cap_used) === 0);

  return (
    <main className="page">
      <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
        ← Home
      </a>
      <p className="eyebrow">{leagueName} · {seasonYear}</p>
      <h1>Cap Sheet</h1>
      <p className="subhead">Salary cap standing across all 10 teams.</p>

      {isProvisional && (
        <p className="form-notice">
          The {seasonYear} salary cap is an estimate and is not final until March 1, {seasonYear}.
          Cap Space and Min Spend below are provisional. Cap Used and Cash Spent are not affected —
          those are what teams already owe, and they do not depend on the cap figure.
        </p>
      )}

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
          {rows.map((t) => {
            const cap = Number(t.fantasy_salary_cap) || 0;
            const used = Number(t.cap_used) || 0;
            const pctUsed = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
            const over = Number(t.cap_space_remaining) < 0;
            const cashRemaining = cashByTeam.get(t.team_id);
            const hasCash = cashRemaining !== undefined && cashRemaining !== null;
            return (
              <tr key={t.team_id}>
                <td className="team-name">
                  <a href={'/team/' + t.team_id} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {t.team_name}
                  </a>
                </td>
                <td className="num">{formatMoney(t.cap_used)}</td>
                <td className={'num ' + (over ? 'negative' : 'positive')}>
                  {formatMoney(t.cap_space_remaining)}
                </td>
                <td className="num">{formatMoney(t.min_required_spend)}</td>
                <td className="num">{formatMoney(t.total_cash_spent)}</td>
                <td className={'num ' + (hasCash ? 'positive' : '')}>
                  {hasCash ? formatMoney(cashRemaining) : '—'}
                </td>
                <td>
                  <div className="cap-meter">
                    <div
                      className={'cap-meter-fill ' + (over ? 'over' : '')}
                      style={{ width: pctUsed + '%' }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="empty-note">
          No cap row exists for {seasonYear} yet, so there is nothing to show. Add that season to
          league_cap_settings to populate this page.
        </p>
      )}

      {allEmpty && (
        <p className="empty-note">
          No contracts entered yet — every team is showing full cap space.
          This fills in as contracts get added.
        </p>
      )}
    </main>
  );
}

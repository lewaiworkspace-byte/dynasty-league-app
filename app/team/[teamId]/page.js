import { supabase } from '../../../lib/supabaseClient';
import TeamCapSheet from './TeamCapSheet';

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

const HORIZON = 5;

export default async function TeamPage({ params }) {
  const { teamId } = params;

  const [
    { data: team, error: teamErr },
    { data: config },
    { data: capSettings },
    { data: cashRows },
  ] = await Promise.all([
    supabase.from('teams').select('id, name').eq('id', teamId).single(),
    supabase
      .from('league_config')
      .select('current_season_year, league_short_name, min_spend_pct')
      .eq('id', true)
      .single(),
    supabase
      .from('league_cap_settings')
      .select('season_year, fantasy_salary_cap, cap_ceiling')
      .order('season_year'),
    supabase
      .from('team_cash_available')
      .select('season_year, cash_available')
      .eq('team_id', teamId),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  if (teamErr || !team) {
    return (
      <main className="page">
        <p className="eyebrow">{leagueName}</p>
        <h1>Team Not Found</h1>
        <p className="subhead">
          <a href="/">&larr; Home</a> &middot; <a href="/cap-sheet">Cap Sheet</a>
        </p>
      </main>
    );
  }

  const currentSeasonYear = config?.current_season_year || 2026;
  const minSpendPct = Number(config?.min_spend_pct) || 0.89;

  const seasons = [];
  for (let i = 0; i < HORIZON; i += 1) seasons.push(currentSeasonYear + i);

  const officialCaps = {};
  (capSettings || []).forEach((r) => {
    const cap = r.fantasy_salary_cap === null ? null : Number(r.fantasy_salary_cap);
    if (cap === null || Number.isNaN(cap)) return;
    officialCaps[r.season_year] = cap;
  });

  const cashAvailable = {};
  (cashRows || []).forEach((r) => {
    cashAvailable[r.season_year] = r.cash_available === null ? null : Number(r.cash_available);
  });

  const { data: contracts } = await supabase
    .from('contracts')
    .select(
      'id, contract_type, status, start_year, total_years, void_years, players(full_name, position, nfl_team)'
    )
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('start_year');

  const contractIds = (contracts || []).map((c) => c.id);

  let yearRows = [];
  if (contractIds.length > 0) {
    const { data } = await supabase
      .from('contract_year_computed')
      .select(
        'contract_id, league_season_year, ppv, cap_charge, cash_value, dead_cap_if_cut, is_void_year'
      )
      .in('contract_id', contractIds)
      .gte('league_season_year', seasons[0])
      .lte('league_season_year', seasons[seasons.length - 1]);
    yearRows = data || [];
  }

  const liabilities = {};
  const rosterBySeason = {};

  seasons.forEach((yr) => {
    liabilities[yr] = { capHit: 0, cashCommitted: 0 };
    rosterBySeason[yr] = [];
  });

  (contracts || []).forEach((c) => {
    const totalSpan = c.total_years + (c.void_years || 0);
    seasons.forEach((yr) => {
      const y = yearRows.find(
        (r) => r.contract_id === c.id && r.league_season_year === yr
      );
      if (!y) return;

      liabilities[yr].capHit += Number(y.cap_charge) || 0;
      liabilities[yr].cashCommitted += Number(y.cash_value) || 0;

      const endYear = c.start_year + totalSpan - 1;
      rosterBySeason[yr].push({
        id: c.id,
        name: c.players?.full_name || 'Unknown Player',
        position: c.players?.position || '\u2014',
        typeLabel: CONTRACT_TYPE_LABELS[c.contract_type] || c.contract_type,
        span: totalSpan > 1 ? c.start_year + '\u2013' + endYear : String(c.start_year),
        startYear: c.start_year,
        yearInDeal: yr - c.start_year + 1,
        totalSpan: totalSpan,
        ppv: y.ppv === null ? null : Number(y.ppv),
        capCharge: y.cap_charge === null ? null : Number(y.cap_charge),
        cashValue: y.cash_value === null ? null : Number(y.cash_value),
        deadCap: y.dead_cap_if_cut === null ? null : Number(y.dead_cap_if_cut),
        isVoidYear: Boolean(y.is_void_year),
      });
    });
  });

  seasons.forEach((yr) => {
    rosterBySeason[yr].sort((a, b) => (b.capCharge || 0) - (a.capCharge || 0));
  });

  return (
    <main className="page">
      <p className="eyebrow">
        {leagueName} &middot; {currentSeasonYear}
      </p>
      <h1>{team.name}</h1>
      <p className="subhead">
        <a href="/">&larr; Home</a> &middot; <a href="/cap-sheet">Cap Sheet</a>
      </p>

      <TeamCapSheet
        seasons={seasons}
        officialCaps={officialCaps}
        minSpendPct={minSpendPct}
        liabilities={liabilities}
        cashAvailable={cashAvailable}
        rosterBySeason={rosterBySeason}
      />
    </main>
  );
}

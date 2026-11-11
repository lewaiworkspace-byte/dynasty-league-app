import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import MiniPlayerCard from './MiniPlayerCard';

export const revalidate = 0;

// THE MINI PLAYER CARD -- UI test batch 10, November 11, 2026.
//
// Lewis on the Roster canvas: "This is perfect, we will refer to this as the
// 'Mini Player Card'", and (3:01 PM) it opens "anywhere" a player is tapped. It
// is its own page so the pop-up sheet (components/SheetHost.js) can show it over
// any page, and the Roster tab's laptop panel can show it beside the list. From
// the top: the header (photo, name, "POS • TEAM · Bye Week N", the status tags
// that left the roster row), the Roster spot buttons (own player only), the
// projected points for the next five weeks with each week's opponent, the season
// with Starts, the contract, and "Open the full player card".
//
// EVERY READ IS THE DATABASE'S, AND NOTHING HERE DECIDES A RULE:
//   edfl_roster_spot_options(contract)  where he can go: each destination
//       current, allowed, allowed with a fine warning, or refused with the
//       engine's own sentence (a rolled-back dry run of set_roster_status);
//   edfl_player_upcoming(player, season, week, 5)  opponents, @ / (N), byes,
//       projections, capped at the last league week;
//   edfl_player_card_summary(player)  Starts (weeks counted / weeks active);
//   edfl_player_season_stats  the season line;
//   contract_year_computed  this season's cap hit and cash;
//   taxi_eligibility_status / roster_injury_status  the tags.
// The week is the first league week of the season that is not final
// (league_week_status.week_is_final), the Roster tab's projection week.
// Failed reads are captured and shown, never drawn as an empty box.

export default async function MiniPlayerCardPage({ params }) {
  const { playerId } = params;
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/player/' + playerId + '/mini');

  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;

  const [{ data: player }, { data: contract }, { data: weekRows }] = await Promise.all([
    supabase
      .from('players')
      .select('id, full_name, position, nfl_team, sleeper_player_id, injury_status')
      .eq('id', playerId)
      .maybeSingle(),
    supabase
      .from('contracts')
      .select('id, team_id, roster_status, contract_type, start_year, total_years, void_years, teams(name)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('league_week_status')
      .select('week_number, week_is_final')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
  ]);

  if (!player) {
    return (
      <main className="page mpc-page">
        <h1 className="mpc-name">Player not found</h1>
      </main>
    );
  }

  const open = (weekRows || []).find(function (w) {
    return !w.week_is_final;
  });
  const week = open ? open.week_number : null;

  const isMine = Boolean(
    viewer.owner && contract && viewer.owner.team_id && viewer.owner.team_id === contract.team_id
  );

  const [upRes, sumRes, statRes, yearRes, taxiRes, injRes, waiverRes, optRes] = await Promise.all([
    week
      ? supabase.rpc('edfl_player_upcoming', { p_player_id: playerId, p_season: season, p_from_week: week, p_count: 5 })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('edfl_player_card_summary', { p_player_id: playerId }),
    supabase
      .from('edfl_player_season_stats')
      .select(
        'games, fantasy_points, fppg, passing_yards, passing_tds, interceptions, rushing_yards, rushing_tds,' +
          ' targets, receptions, receiving_yards, receiving_tds, xp_att, xp_made, fg_att, fg_made'
      )
      .eq('player_id', playerId)
      .eq('season_year', season)
      .maybeSingle(),
    contract
      ? supabase
          .from('contract_year_computed')
          .select('cap_charge, cash_value, is_void_year')
          .eq('contract_id', contract.id)
          .eq('league_season_year', season)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    contract
      ? supabase
          .from('taxi_eligibility_status')
          .select('weeks_used, weeks_max, warning, locked, last_demotion_available, eligibility_spent, held, hold_note, poach_exempt, elevated')
          .eq('contract_id', contract.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    contract
      ? supabase
          .from('roster_injury_status')
          .select('injury_flagged, injury_label, ir_ineligible, ir_ineligible_reason')
          .eq('contract_id', contract.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    contract
      ? supabase
          .from('waiver_placements')
          .select('id')
          .eq('contract_id', contract.id)
          .eq('outcome', 'pending')
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    contract && isMine
      ? supabase.rpc('edfl_roster_spot_options', { p_contract_id: contract.id })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const summary = (sumRes.data && sumRes.data[0]) || null;
  const upcoming = upRes.data || [];
  const byeWeek = upcoming.length ? upcoming[0].bye_week : null;

  return (
    <main className="page mpc-page">
      <MiniPlayerCard
        season={season}
        week={week}
        player={player}
        contract={
          contract
            ? {
                id: contract.id,
                teamName: contract.teams ? contract.teams.name : null,
                rosterStatus: contract.roster_status,
                startYear: contract.start_year,
                totalSpan: Number(contract.total_years) + Number(contract.void_years || 0),
                capCharge: yearRes.data ? yearRes.data.cap_charge : null,
                cashValue: yearRes.data ? yearRes.data.cash_value : null,
                isVoidYear: Boolean(yearRes.data && yearRes.data.is_void_year),
              }
            : null
        }
        contractError={yearRes.error ? yearRes.error.message : null}
        isMine={isMine}
        onWaivers={Boolean(waiverRes.data && waiverRes.data.length)}
        options={optRes.data || null}
        optionsError={optRes.error ? optRes.error.message : null}
        upcoming={upcoming}
        upcomingError={upRes.error ? upRes.error.message : null}
        byeWeek={byeWeek}
        summary={summary}
        summaryError={sumRes.error ? sumRes.error.message : null}
        stats={statRes.data || null}
        statsError={statRes.error ? statRes.error.message : null}
        taxi={taxiRes.data || null}
        injury={injRes.data || null}
      />
    </main>
  );
}

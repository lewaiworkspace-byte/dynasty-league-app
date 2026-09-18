import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import PlayerCard from './PlayerCard';

export const revalidate = 0;

// The Player Card. One page per player: identity, the Player Value Chart
// strip, then THREE tabs -- Overview / Contract / Stats.
//
// IT HAD FIVE (Contract Details / EDFL Earnings / Transactions / Statistics /
// Market Value) and phase 2D-1 cut it to three, the way R-9 cut Team HQ.
// Nothing was dropped and no tab component was rewritten:
//
//   Market Value   its headline -- total PPV, per-year value, tier, and which
//                  chart edition said so -- is now the strip under the name,
//                  visible on every tab instead of behind one. Its history
//                  chart is a block at the foot of Contract.
//   EDFL Earnings  a block at the foot of Contract, under "Career in the EDFL".
//                  What he has been paid belongs beside what he costs.
//   Transactions   a block at the foot of Overview, which is the "what is going
//                  on with this player" tab.
//
// ContractTab, EarningsTab, MarketValueTab, TransactionsTab and StatsTab are
// UNTOUCHED by that batch. They are where the rule-dense work lives -- the
// restructure prose, the void-year arithmetic, the feed's kind vocabulary --
// and re-hosting them needed no edit, because each returns a bare fragment.
//
// EVERY query on this page filters by player_id. players holds 3,253 rows
// and PostgREST truncates at 1,000 -- an unfiltered select here is the
// /admin/fix-contracts failure all over again. The card also exists for
// players who have never held an EDFL contract (free agents an owner is
// scouting): for them the contract, earnings and transaction blocks are
// legitimately empty and say so, rather than pretending the player is
// unknown.
//
// All money arrives from the database views already computed
// (player_card_header, player_contract_history, player_career_earnings,
// player_transaction_feed, contract_year_computed). This page adds NO
// arithmetic beyond display-time cumulative sums of database values, the
// same concession /team/[teamId] already makes for its liability rows.
//
// The queries run as the logged-in user (createSupabaseServerClient), not
// the shared anon client, because the card views are granted to
// authenticated only -- and player_transaction_feed is security_invoker on
// purpose, so each owner sees their own losing bids and nobody else's.
// Querying with the anon client would return nothing; querying with the
// admin client would show every owner every bid. Neither is the card.

export default async function PlayerPage({ params }) {
  const { playerId } = params;

  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/player/' + playerId);

  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year, league_short_name')
    .eq('id', true)
    .single();

  const currentSeasonYear = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  const [
    { data: header, error: headerErr },
    { data: contracts },
    { data: years },
    { data: earnings },
    { data: feed },
    { data: valueHistory },
    { data: capSettings },
    { data: taxiStatus },
    { data: weekRows, error: weekErr },
    { data: weekFinality },
  ] = await Promise.all([
    supabase
      .from('player_card_header')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('player_contract_history')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('player_contract_year_breakdown')
      .select('*')
      .eq('player_id', playerId)
      .order('league_season_year', { ascending: true }),
    supabase
      .from('player_career_earnings')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('player_transaction_feed')
      .select('*')
      .eq('player_id', playerId)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('player_value_history')
      .select(
        'snapshot_label, snapshot_as_of, recency_rank, chart_position, chart_rank, ' +
          'per_year_value, likely_years, total_ppv, value_tier, notes, ' +
          'prev_total_ppv, total_ppv_delta, likely_years_delta, is_new_this_snapshot'
      )
      .eq('player_id', playerId)
      .order('recency_rank', { ascending: true }),
    supabase
      .from('league_cap_settings')
      .select('season_year, fantasy_salary_cap, is_provisional')
      .order('season_year'),
    // Rule 3.3(i). The view is security_invoker and contracts is public
    // read, so this resolves on any player's card, not only the viewer's
    // own team -- which is the point: an owner weighing a trade should see
    // that the rookie he is buying has two of his three weeks gone.
    // Filtered by player_id like every other query here (SR-29); the view
    // carries one row per ACTIVE contract, so a player between contracts
    // legitimately has none and the warning simply does not render.
    supabase
      .from('taxi_eligibility_status')
      .select(
        'contract_id, weeks_used, weeks_max, weeks_left, eligibility_spent, warning, locked, last_demotion_available'
      )
      .eq('player_id', playerId)
      .maybeSingle(),
    // THIS SEASON'S WEEKLY SCORES, for the Overview tab (2D-1). Fourteen rows
    // at most -- filtered by player AND season, so the row ceiling cannot bite.
    //
    // player_week_scores, NOT edfl_game_fantasy_points. The NFL stat feed has
    // no 2026 rows at all, which is why the Stats tab covers 2021-2025 and this
    // block covers the live season. They answer different questions and must
    // not be merged: one is NFL production, this is what he scored for an EDFL
    // team in an EDFL week.
    //
    // roster_status_at_sync and was_sleeper_starter are recorded per week, so a
    // week he spent on the taxi squad reads as that rather than as a bad game.
    supabase
      .from('player_week_scores')
      .select('week_number, points, roster_status_at_sync, was_sleeper_starter, team_id')
      .eq('player_id', playerId)
      .eq('season_year', currentSeasonYear)
      .order('week_number', { ascending: true }),
    // WHETHER EACH WEEK IS FINAL, from the view's own flag. CLAUDE.md: never
    // derive "final" from a clock in a component. Every matchup in a week
    // carries the same week_is_final, so this is deduped below into one entry
    // per week -- that is a lookup, not arithmetic. Bounded by season: fourteen
    // weeks of five matchups.
    supabase
      .from('league_scoreboard')
      .select('week_number, week_is_final')
      .eq('season_year', currentSeasonYear),
  ]);

  // The current season's authoritative dead cap comes from the same
  // engine the team page uses -- team_cut_previews -- not from the static
  // dead_cap_if_cut estimate. Future seasons keep the estimate, marked as
  // such. Only an active contract has a live preview to fetch.
  let livePreview = null;
  if (header && header.current_contract_id && header.current_team_id) {
    const { data: previews } = await supabase.rpc('team_cut_previews', {
      p_team_id: header.current_team_id,
    });
    const mine = (previews || []).find(function (r) {
      return r.contract_id === header.current_contract_id;
    });
    if (mine) livePreview = mine;
  }

  if (headerErr || !header) {
    return (
      <main className="page page-narrow">
        <p className="eyebrow">{leagueName}</p>
        <h1>Player Not Found</h1>
        <p className="subhead">
          No player exists with this id. <a href="/cap-sheet">&larr; Cap Sheet</a>{' '}
          &middot; <a href="/league">League</a>
        </p>
      </main>
    );
  }

  const finalByWeek = {};
  (weekFinality || []).forEach((r) => {
    if (r.week_is_final) finalByWeek[r.week_number] = true;
  });

  const weeks = (weekRows || []).map((r) => ({
    week: r.week_number,
    // A SCORE IS NOT MONEY and is never rounded. Carried as the string
    // PostgREST returned: Number('0.00') renders as "0", and a real zero -- which
    // this player posted in Week 2 -- would then read as "not reported" beside a
    // row that says a dash for exactly that.
    points: r.points === null || r.points === undefined ? null : String(r.points),
    started: Boolean(r.was_sleeper_starter),
    rosterStatus: r.roster_status_at_sync || 'active',
    isFinal: Boolean(finalByWeek[r.week_number]),
  }));

  return (
    <main className="page">
      <PlayerCard
        leagueName={leagueName}
        currentSeasonYear={currentSeasonYear}
        header={header}
        contracts={contracts || []}
        years={years || []}
        livePreview={livePreview}
        earnings={earnings || null}
        feed={feed || []}
        valueHistory={valueHistory || []}
        capSettings={capSettings || []}
        taxiStatus={taxiStatus || null}
        weeks={weeks}
        weeksError={weekErr ? weekErr.message : null}
      />
    </main>
  );
}

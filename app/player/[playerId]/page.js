import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import PlayerCard from './PlayerCard';

export const revalidate = 0;

// The Player Card. One page per player, Spotrac-shaped: identity header,
// stat strip, then five tabs (Contract Details / EDFL Earnings /
// Transactions / Statistics / Market Value).
//
// EVERY query on this page filters by player_id. players holds 3,253 rows
// and PostgREST truncates at 1,000 -- an unfiltered select here is the
// /admin/fix-contracts failure all over again. The card also exists for
// players who have never held an EDFL contract (free agents an owner is
// scouting): for them the contract, earnings and transaction tabs are
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

  const [
    { data: header, error: headerErr },
    { data: contracts },
    { data: years },
    { data: earnings },
    { data: feed },
    { data: valueHistory },
    { data: capSettings },
    { data: config },
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
    supabase
      .from('league_config')
      .select('current_season_year, league_short_name')
      .eq('id', true)
      .single(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

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
          No player exists with this id. <a href="/">&larr; Home</a>
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <PlayerCard
        leagueName={leagueName}
        currentSeasonYear={config?.current_season_year || 2026}
        header={header}
        contracts={contracts || []}
        years={years || []}
        livePreview={livePreview}
        earnings={earnings || null}
        feed={feed || []}
        valueHistory={valueHistory || []}
        capSettings={capSettings || []}
      />
    </main>
  );
}

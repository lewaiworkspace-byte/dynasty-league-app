import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { formatShortDateTime } from '../../../lib/formatDate';

// THE PLAYER CARD'S READS, shared by the card (page.js) and its Full contract
// details page (contract/page.js) -- UI test batch 6, November 2026. Moved
// here, unedited in substance, from page.js so the two pages cannot read the
// same contract two different ways (SR-62). The comments that explain each
// read moved with it.
//
// EVERY query here filters by player_id. players holds thousands of rows and
// PostgREST truncates at 1,000 -- an unfiltered select here is the
// /admin/fix-contracts failure all over again. The card also exists for
// players who have never held an EDFL contract (free agents an owner is
// scouting): for them the contract, earnings and transaction blocks are
// legitimately empty and say so, rather than pretending the player is
// unknown.
//
// All money arrives from the database views already computed
// (player_card_header, player_contract_history, player_career_earnings,
// player_transaction_feed, contract_year_computed). Nothing here adds any.
//
// The queries run as the logged-in user (createSupabaseServerClient), not
// the shared anon client, because the card views are granted to
// authenticated only -- and player_transaction_feed is security_invoker on
// purpose, so each owner sees what the bids policy lets him see. Querying with
// the anon client would return nothing; querying with the admin client would
// show every owner every bid. Neither is the card.
//
// `season: true` adds the card's own season reads (the header's start rate,
// the This season chart). They are database functions, so no score is summed
// and no trend is fitted in the browser:
//   edfl_player_card_summary(player)      one row: which season is shown (the
//       current one once any of its weeks is final, otherwise the last), the
//       start rate (final weeks his points counted in his EDFL team's
//       best-ball lineup / final weeks he was on an EDFL active roster), the
//       finished weeks' total and average, how he did against his
//       projections, and the least-squares trend.
//   edfl_player_card_weeks(player, season) one row per scheduled week: his
//       EDFL points, his projection, whether the week is final, and whether
//       his points counted. Week finality is the database's flag (CLAUDE.md:
//       never derive "final" from a clock in a component).
// A failed read is CAPTURED and the season box shows it as an error, never as
// an empty season (money-and-dates.md: a blank must never read as fine).

export async function loadPlayerCard(playerId, opts) {
  const withSeason = Boolean(opts && opts.season);
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
    summaryRes,
  ] = await Promise.all([
    supabase.from('player_card_header').select('*').eq('player_id', playerId).maybeSingle(),
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
    supabase.from('player_career_earnings').select('*').eq('player_id', playerId).maybeSingle(),
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
    // The view carries one row per ACTIVE contract, so a player between
    // contracts legitimately has none and the warning simply does not render.
    supabase
      .from('taxi_eligibility_status')
      .select(
        'contract_id, weeks_used, weeks_max, weeks_left, eligibility_spent, warning, locked, last_demotion_available'
      )
      .eq('player_id', playerId)
      .maybeSingle(),
    withSeason
      ? supabase.rpc('edfl_player_card_summary', { p_player_id: playerId })
      : Promise.resolve({ data: null, error: null }),
  ]);

  // THE SEASON: the summary names it, then one call reads its weeks.
  let summary = null;
  let weeks = [];
  let seasonError = null;
  if (withSeason) {
    if (summaryRes.error) {
      seasonError = summaryRes.error.message;
    } else {
      summary = (summaryRes.data && summaryRes.data[0]) || null;
      if (summary && summary.season_year) {
        const { data: wk, error: wkErr } = await supabase.rpc('edfl_player_card_weeks', {
          p_player_id: playerId,
          p_season: summary.season_year,
        });
        if (wkErr) seasonError = wkErr.message;
        else weeks = wk || [];
      }
    }
  }

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

  // ON WAIVERS -- October 6, 2026, commissioner's instruction: a player cut in
  // season and pending on the wire reads "On waivers" on his card, not the
  // roster spot he was cut from. His contract stays status 'active' with its
  // old roster_status until the run settles it, so player_card_header still
  // reports roster_status 'taxi' / 'ir' / 'active'. Same predicate as
  // edfl_on_waivers() and as Team HQ's On Waivers section: a placement on his
  // current contract with outcome 'pending'. waiver_placements is public read;
  // waiver_claims (sealed) is not touched.
  //
  // THE ERROR IS CAPTURED: a failed read would otherwise show the old roster
  // spot, which is the wrong answer this exists to remove.
  let waiver = null;
  let waiverError = null;
  if (header && header.current_contract_id) {
    const { data: wRow, error: wErr } = await supabase
      .from('waiver_placements')
      .select('id, waived_at, waiver_runs(runs_at, week_number)')
      .eq('contract_id', header.current_contract_id)
      .eq('outcome', 'pending')
      .maybeSingle();
    if (wErr) {
      waiverError = wErr.message;
    } else if (wRow) {
      const run = wRow.waiver_runs || null;
      waiver = {
        waivedAtLabel: formatShortDateTime(wRow.waived_at),
        runAtLabel: run && run.runs_at ? formatShortDateTime(run.runs_at) : null,
        runWeek: run ? run.week_number : null,
      };
    }
  }

  return {
    leagueName,
    currentSeasonYear,
    header: headerErr ? null : header || null,
    contracts: contracts || [],
    years: years || [],
    earnings: earnings || null,
    feed: feed || [],
    valueHistory: valueHistory || [],
    capSettings: capSettings || [],
    taxiStatus: taxiStatus || null,
    livePreview,
    waiver,
    waiverError,
    summary,
    weeks,
    seasonError,
  };
}

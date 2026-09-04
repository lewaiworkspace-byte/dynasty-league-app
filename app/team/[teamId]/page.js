import { supabase } from '../../../lib/supabaseClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
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
    me,
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
    getCurrentTeamOwner(),
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

  // OWN ROSTER ONLY, FOR EVERYONE INCLUDING THE COMMISSIONER (Sep 4, 2026).
  //
  // This read "own team OR isCommissionerOrCo" from August 25 until now, which
  // made a team page the place a commissioner cut somebody else's player.
  // Under the standing rule a League/Teams surface treats the commissioner as
  // an ordinary owner, so cut-from-any-roster moved to /admin/cuts, which now
  // mounts the same CutPlayerDialog against any contract.
  //
  // The capability was moved, not removed -- the Admin control shipped in the
  // same commit. Do not widen this back; add to /admin/cuts instead.
  //
  // cut_player() still enforces ownership itself. This flag only decides
  // whether the button is drawn.
  const canCut = Boolean(me && me.team_id === teamId);

  // Same rule, and deliberately a separate name rather than reusing canCut.
  // They are two different permissions in the rule book and nothing guarantees
  // they stay in step; one changing should not silently change the other.
  //
  // Also own-roster-only now, for the same reason as canCut. Moving a player
  // on somebody else's roster lives on /admin/cuts, which mounts this same
  // RosterMoveDialog against any contract. set_roster_status() still permits
  // it; only where the control is drawn changed.
  const canMove = canCut;

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
      'id, contract_type, status, roster_status, start_year, total_years, void_years, players(id, full_name, position, nfl_team)'
    )
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('start_year');

  const contractIds = (contracts || []).map((c) => c.id);

  // THE ERROR IS CAPTURED, NOT DISCARDED. This read used to be
  // a bare const { data } destructure, and that swallowed error is how the Overview
  // totals silently became dead-money-only: a failure here left yearRows
  // empty, every contract fell out of the aggregation, and the page reported
  // a Cap Hit of $31 as though it were the truth. The totals no longer come
  // from here at all, but the roster table still does, and an empty roster
  // with no explanation is its own bad failure.
  let yearRows = [];
  let yearRowsError = null;
  if (contractIds.length > 0) {
    const { data, error } = await supabase
      .from('contract_year_computed')
      .select(
        'contract_id, league_season_year, ppv, cap_charge, cash_value, dead_cap_if_cut, is_void_year'
      )
      .in('contract_id', contractIds)
      .gte('league_season_year', seasons[0])
      .lte('league_season_year', seasons[seasons.length - 1]);
    yearRows = data || [];
    yearRowsError = error || null;
  }

  // Authoritative cut settlements for the CURRENT season, straight from the
  // dead-money engine. contract_year_computed.dead_cap_if_cut is a static
  // projection that knows nothing about weeks charged, the June 1st split,
  // roster bonus conversion, or triggered option bonuses -- it is kept only
  // for future seasons, where it is explicitly labelled an estimate.
  //
  // Note this is a DIFFERENT question from the dead money in team_cap_by_season.
  // "what would it cost to cut this player", for players still on the
  // roster. That asks "what has already been charged", for players who are
  // gone. They must never be added together.
  const cutPreviews = {};
  {
    const { data: previews } = await supabase.rpc('team_cut_previews', {
      p_team_id: teamId,
    });
    (previews || []).forEach((p) => {
      cutPreviews[p.contract_id] = {
        deadCap: p.dead_cap_current_year === null ? null : Number(p.dead_cap_current_year),
        deadCapNext: p.dead_cap_next_year === null ? null : Number(p.dead_cap_next_year),
        deadCash:
          p.dead_cash_current_year === null ? null : Number(p.dead_cash_current_year),
        june1Split: p.june1_split,
      };
    });
  }

  // EVERY OVERVIEW TOTAL IS READ FROM team_cap_by_season. NOTHING IS SUMMED
  // HERE, AND NOTHING MAY BE.
  //
  // This page used to build Cap Hit and Cash Committed in JavaScript: seed
  // each season with its dead money, then add each contract's cap_charge and
  // cash_value from contract_year_computed. The contract query's error was
  // discarded (a bare data destructure), so any failure left yearRows empty,
  // every find() missed, and the totals silently collapsed to DEAD MONEY
  // ALONE. Cash Over Cap read a Cap Hit of $31 against a true 1,461.67 and a
  // Cap Space of $1,470 against a true $38.33 -- and six teams with no
  // contract_events at all read $0 and a full $1,500 of room, including two
  // that were actually OVER the cap, three days before the September 7 hard
  // block. The page even contradicted itself: Cash Available was right, and
  // could not be reconciled with the Cash Committed row above it.
  //
  // team_cap_summary could not be used for this because it CROSS JOINs
  // league_cap_settings, which holds only 2026 and 2027 -- it returns nothing
  // for the later seasons this five-season grid shows. team_cap_by_season
  // (Sep 4 2026) is the same arithmetic extended to every season a contract
  // or event touches, which is why the aggregation could finally leave JS.
  const { data: capRows, error: capRowsError } = await supabase
    .from('team_cap_by_season')
    .select(
      'league_season_year, cap_used, dead_cap, cap_space_remaining, fantasy_salary_cap, cap_is_set, cap_is_provisional, min_required_spend, cash_used, dead_cash'
    )
    .eq('team_id', teamId)
    .gte('league_season_year', seasons[0])
    .lte('league_season_year', seasons[seasons.length - 1]);

  const capBySeason = {};
  (capRows || []).forEach((r) => {
    capBySeason[r.league_season_year] = {
      capHit: r.cap_used,
      deadCap: r.dead_cap,
      capSpace: r.cap_space_remaining,
      salaryCap: r.fantasy_salary_cap,
      capIsSet: Boolean(r.cap_is_set),
      capIsProvisional: Boolean(r.cap_is_provisional),
      minSpend: r.min_required_spend,
      cashCommitted: r.cash_used,
      deadCash: r.dead_cash,
    };
  });

  // capIsSet and capIsProvisional are CARRIED BUT NOT RENDERED YET, on
  // purpose. The grid's SET/PROJ tag answers a different question -- whether
  // league_cap_settings has a row for that season at all -- while
  // cap_is_provisional means a cap that IS set and is still an estimate.
  // Surfacing that on future seasons is the standing to-do item in CLAUDE.md,
  // and it changes what owners read, so it belongs in its own change rather
  // than riding along with a totals fix. They are selected here so that change
  // is a render, not another query edit.

  const rosterBySeason = {};
  seasons.forEach((yr) => {
    rosterBySeason[yr] = [];
  });

  (contracts || []).forEach((c) => {
    const totalSpan = c.total_years + (c.void_years || 0);
    seasons.forEach((yr) => {
      const y = yearRows.find(
        (r) => r.contract_id === c.id && r.league_season_year === yr
      );
      if (!y) return;

      const endYear = c.start_year + totalSpan - 1;
      const live = yr === currentSeasonYear ? cutPreviews[c.id] : null;

      rosterBySeason[yr].push({
        id: c.id,
        name: c.players?.full_name || 'Unknown Player',
        playerId: c.players?.id || null,
        position: c.players?.position || '\u2014',
        typeLabel: CONTRACT_TYPE_LABELS[c.contract_type] || c.contract_type,
        // Where this player currently sits: active | taxi | ir. Displayed as a
        // tag beside the name when it is not 'active', and used by the roster
        // move dialog to know which destinations are worth offering. It is
        // never used to decide whether a move is LEGAL -- set_roster_status()
        // and the check_taxi_eligibility trigger own that.
        rosterStatus: c.roster_status || 'active',
        span: totalSpan > 1 ? c.start_year + '\u2013' + endYear : String(c.start_year),
        startYear: c.start_year,
        yearInDeal: yr - c.start_year + 1,
        totalSpan: totalSpan,
        ppv: y.ppv === null ? null : Number(y.ppv),
        capCharge: y.cap_charge === null ? null : Number(y.cap_charge),
        cashValue: y.cash_value === null ? null : Number(y.cash_value),
        deadCap:
          live && live.deadCap !== null
            ? live.deadCap
            : y.dead_cap_if_cut === null
            ? null
            : Number(y.dead_cap_if_cut),
        deadCapNext: live ? live.deadCapNext : null,
        deadCapLive: Boolean(live && live.deadCap !== null),
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
        currentSeasonYear={currentSeasonYear}
        officialCaps={officialCaps}
        minSpendPct={minSpendPct}
        capBySeason={capBySeason}
        capRowsError={capRowsError ? capRowsError.message : null}
        yearRowsError={yearRowsError ? yearRowsError.message : null}
        cashAvailable={cashAvailable}
        rosterBySeason={rosterBySeason}
        canCut={canCut}
        canMove={canMove}
      />
    </main>
  );
}

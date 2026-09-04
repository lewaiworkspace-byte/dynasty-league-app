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

  // DEAD MONEY FROM CUTS AND OTHER SETTLED OBLIGATIONS.
  //
  // The contracts query above filters status = 'active', so a cut contract
  // and every one of its contract_year_computed rows disappear from this
  // page entirely. Its dead money does not: it is a real charge against the
  // team and team_cap_summary counts it. Before this query existed, the Cap
  // Hit here and the Cap Used on /cap-sheet were two different numbers for
  // the same team and season -- Cash Over Cap read 1667.67 here and 1671.67
  // there, the $4 difference being the only cut in the league.
  //
  // Two terms, mirroring team_cap_summary rather than re-deriving anything:
  //   dead_cap_current_year  -> the season the cut happened in
  //   dead_cap_next_year     -> the FOLLOWING season (June 1st treatment,
  //                             5.18(c), which splits prorations across two)
  // and the same pair for cash.
  //
  // reversed_at IS NULL is mandatory. A reversed cut keeps its row forever
  // as a public record; counting it would resurrect dead money the reversal
  // erased.
  //
  // ONE TERM OF team_cap_summary IS DELIBERATELY NOT REPRODUCED: charges on
  // a cut contract for seasons BEFORE the cut (its league_season_year <
  // event_season_year). Those are seasons already played and paid, and this
  // page's horizon starts at the CURRENT season and runs forward, so no such
  // season is ever in range. If HORIZON is ever changed to look backwards,
  // that term has to be added here too.
  const deadBySeason = {};
  {
    const { data: events } = await supabase
      .from('contract_events')
      .select(
        'event_season_year, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year'
      )
      .eq('from_team_id', teamId)
      .is('reversed_at', null);

    (events || []).forEach((ev) => {
      const yr = Number(ev.event_season_year);
      const next = yr + 1;

      if (!deadBySeason[yr]) deadBySeason[yr] = { cap: 0, cash: 0 };
      deadBySeason[yr].cap += Number(ev.dead_cap_current_year) || 0;
      deadBySeason[yr].cash += Number(ev.dead_cash_current_year) || 0;

      if (!deadBySeason[next]) deadBySeason[next] = { cap: 0, cash: 0 };
      deadBySeason[next].cap += Number(ev.dead_cap_next_year) || 0;
      deadBySeason[next].cash += Number(ev.dead_cash_next_year) || 0;
    });
  }

  // Authoritative cut settlements for the CURRENT season, straight from the
  // dead-money engine. contract_year_computed.dead_cap_if_cut is a static
  // projection that knows nothing about weeks charged, the June 1st split,
  // roster bonus conversion, or triggered option bonuses -- it is kept only
  // for future seasons, where it is explicitly labelled an estimate.
  //
  // Note this is a DIFFERENT question from deadBySeason above. This asks
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

  const liabilities = {};
  const rosterBySeason = {};

  seasons.forEach((yr) => {
    // Seed with dead money before adding live contracts, so a season whose
    // only charge is dead money still reports it. Starting at zero and
    // adding later would be equivalent; seeding makes the omission
    // impossible to reintroduce by moving the loop.
    const dead = deadBySeason[yr] || { cap: 0, cash: 0 };
    liabilities[yr] = { capHit: dead.cap, cashCommitted: dead.cash };
    rosterBySeason[yr] = [];
  });

  (contracts || []).forEach((c) => {
    const totalSpan = c.total_years + (c.void_years || 0);
    seasons.forEach((yr) => {
      const y = yearRows.find(
        (r) => r.contract_id === c.id && r.league_season_year === yr
      );
      if (!y) return;

      // Void rows are included deliberately: a void year carries real
      // prorated cap charge, and team_cap_summary sums cap_charge with no
      // is_void_year filter either. Excluding them here would put the two
      // totals exactly one void proration apart.
      liabilities[yr].capHit += Number(y.cap_charge) || 0;
      liabilities[yr].cashCommitted += Number(y.cash_value) || 0;

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

  // Dead money per season, passed separately so the grid can show it as its
  // own line rather than burying it inside Cap Hit. An owner looking at a
  // total that does not match the sum of the players listed beneath it has
  // no way to find the difference otherwise.
  const deadMoney = {};
  seasons.forEach((yr) => {
    const dead = deadBySeason[yr] || { cap: 0, cash: 0 };
    deadMoney[yr] = { cap: dead.cap, cash: dead.cash };
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
        liabilities={liabilities}
        deadMoney={deadMoney}
        cashAvailable={cashAvailable}
        rosterBySeason={rosterBySeason}
        canCut={canCut}
        canMove={canMove}
      />
    </main>
  );
}

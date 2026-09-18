import { supabase } from '../../../lib/supabaseClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import ComplianceBanner from '../../../components/ComplianceBanner';
import TeamCapSheet from './TeamCapSheet';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { DesignatedCuts } from '../../waivers/WaiverBoard';
import { formatRoom } from '../../../lib/formatMoney';
import { formatShortDateTime, EASTERN_TIME_ZONE } from '../../../lib/formatDate';

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

// THE CONTRACT MARKER, rule R-10 as it shipped in 2A. Colour on a roster row
// says what KIND of contract it is, and it marks the EXCEPTIONS: a rookie deal
// is teal, a practice squad deal is dimmed and dashed, and veteran free agency
// -- the majority of every roster -- is left alone. The three-colour version
// borrowed --c-cap and --c-ppv, and a currency colour means one thing
// everywhere (CLAUDE.md, CSS conventions).
//
// Keyed on contract_type, which is the contract's own kind. It is NOT
// roster_status: a practice-squad CONTRACT and a player sitting on the taxi
// squad this week are two different facts, and the roster table already shows
// the second one as its own tag beside the name.
//
// Anything not named here is unmarked. That is deliberate rather than a gap --
// the tags and the fifth-year option are neither of the two exceptions.
const CONTRACT_MARKER = {
  rookie: 'ct-rookie',
  practice_squad: 'ct-practice',
};

// THE GRID SPANS EVERY SEASON THE TEAM HAS MONEY IN, NEVER FEWER THAN FIVE
// (September 16, 2026). This was a flat HORIZON = 5, and void acceleration can
// land a real charge one season past a contract's last void year -- a 2031
// charge on a grid that stopped at 2030 was simply not shown. The span is now
// read from team_cap_by_season, which carries every season a contract or a
// dead-money event touches. MAX_SEASONS is a guard against a runaway row, not a
// rule: no contract shape today reaches it.
const MIN_SEASONS = 5;
const MAX_SEASONS = 10;

// How many rows the two Overview lists show. Small on purpose: the Overview is
// a glance, and both lists have a full page behind them.
const COMING_UP_ROWS = 4;
const RECENT_MOVE_ROWS = 5;

// A calendar entry's `detail` is a full paragraph of rule text -- the poaching
// window's runs to 700 characters. The Overview shows the first sentence's
// worth and sends the reader to /calendar for the rest. Cut on a word boundary
// so the tail never reads as a typo.
// "Wed, Sep 23 · 12:00 AM ET", the shape league_calendar's own day_label and
// time_label already come in. The waiver run is the one instant on the Coming
// Up list that does NOT come from that view -- waiver_runs holds a raw
// timestamptz -- and a list where one row reads "Sep 23, 12:00 AM ET" among
// three that read "Tue, Sep 22 · 12:00 AM ET" looks like a bug.
//
// The zone is pinned to the imported constant rather than repeated, and this
// runs in a Server Component, which never hydrates. lib/formatDate.js has no
// export of this exact shape and this is its only caller, so it is not worth a
// second one there yet; if a third surface wants it, move it.
function etWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  return day + ' · ' + time + ' ET';
}

function firstLine(text, max) {
  if (!text) return null;
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut) + '…';
}

export default async function TeamPage({ params }) {
  const { teamId } = params;

  const [
    { data: team, error: teamErr },
    { data: config },
    { data: capSettings },
    { data: cashRows },
    me,
  ] = await Promise.all([
    supabase.from('teams').select('id, name, abbrev').eq('id', teamId).single(),
    supabase
      .from('league_config')
      .select('current_season_year, league_short_name, min_spend_pct')
      .eq('id', true)
      .single(),
    supabase
      .from('league_cap_settings')
      .select('season_year, fantasy_salary_cap, cap_ceiling, is_provisional')
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
  // This read "own team OR isCommissionerOrCo" from August 25 until then, which
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

  // Whether this page is the viewer's OWN Team HQ. Used only for wording --
  // "Your recent moves" against "Recent moves" -- and never as a gate. Every
  // read below is either league-public or gated by the database.
  const isMine = canCut;

  // EVERY OVERVIEW TOTAL IS READ FROM team_cap_by_season -- see the long note
  // further down, where the rows are turned into capBySeason. The read happens
  // here, before the season list exists, because the list is derived from it:
  // no upper bound on the season, one team, a handful of rows.
  const { data: capRows, error: capRowsError } = await supabase
    .from('team_cap_by_season')
    .select(
      'league_season_year, cap_used, dead_cap, cap_space_remaining, fantasy_salary_cap, cap_is_set, cap_is_provisional, min_required_spend, cash_used, dead_cash'
    )
    .eq('team_id', teamId)
    .gte('league_season_year', currentSeasonYear)
    .order('league_season_year', { ascending: true });

  let lastSeason = currentSeasonYear + MIN_SEASONS - 1;
  (capRows || []).forEach((r) => {
    const touched =
      Number(r.cap_used) !== 0 ||
      Number(r.dead_cap) !== 0 ||
      Number(r.cash_used) !== 0 ||
      Number(r.dead_cash) !== 0;
    if (touched && r.league_season_year > lastSeason) lastSeason = r.league_season_year;
  });
  lastSeason = Math.min(lastSeason, currentSeasonYear + MAX_SEASONS - 1);

  const seasons = [];
  for (let yr = currentSeasonYear; yr <= lastSeason; yr += 1) seasons.push(yr);

  // The ceiling the league enforces for a season is the ceiling the
  // commissioner set, or the base cap where none is set -- exactly
  // team_cap_compliance's COALESCE(cap_ceiling, fantasy_salary_cap). Picking the
  // one present value is not money arithmetic. Rule 5.5 adds each team's own
  // rollover; rollover is not calculated yet, so no season here includes it and
  // the footnote says so. This replaced a flat 111% applied to every season.
  const officialCaps = {};
  const officialCeilings = {};
  const provisionalCaps = {};
  (capSettings || []).forEach((r) => {
    const cap = r.fantasy_salary_cap === null ? null : Number(r.fantasy_salary_cap);
    if (cap === null || Number.isNaN(cap)) return;
    officialCaps[r.season_year] = cap;
    const ceiling = r.cap_ceiling === null ? cap : Number(r.cap_ceiling);
    officialCeilings[r.season_year] = Number.isNaN(ceiling) ? null : ceiling;
    provisionalCaps[r.season_year] = Boolean(r.is_provisional);
  });

  const cashAvailable = {};
  (cashRows || []).forEach((r) => {
    cashAvailable[r.season_year] = r.cash_available === null ? null : Number(r.cash_available);
  });

  // IN-SEASON COMPLIANCE (rule 3.6). One row, this team, current season.
  //
  // The view is present-tense by construction -- it has no season parameter
  // and reports on league_config.current_season_year -- so there is nothing
  // to filter but the team. maybeSingle() rather than single() because a
  // missing row is a legitimate state the banner renders, not an exception.
  //
  // THE ERROR IS CAPTURED. A compliance banner that renders green because the
  // query failed is worse than no banner, so ComplianceBanner has no green
  // fallback: given an error it says so and says the page is not answering
  // the question. Same lesson as yearRows below.
  //
  // THE OVERVIEW'S ROSTER COUNTS AND CAP BAR READ THIS SAME ROW, deliberately.
  // The counts are the view's own active_count / ps_count / ir_count against
  // its own limit columns, so the strip cannot disagree with the banner
  // sitting above it, and neither of them is counted in JavaScript.
  const { data: complianceRow, error: complianceError } = await supabase
    .from('team_inseason_compliance')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();

  const { data: contracts } = await supabase
    .from('contracts')
    .select(
      'id, contract_type, status, roster_status, start_year, total_years, void_years, players(id, full_name, position, nfl_team)'
    )
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('start_year');

  // Rule 3.3(i), for the roster table's name column. One read for the whole
  // team, filtered by team_id (SR-29) -- the view holds one row per active
  // contract, so this is bounded by the roster and cannot approach the
  // PostgREST 1,000-row ceiling.
  //
  // NOT CAPTURED AS AN ERROR, unlike complianceRow above. The badge is an
  // advisory: the check_taxi_eligibility trigger still refuses an illegal
  // move with its own sentence, so a failed read costs an owner information
  // and never a rule. A missing badge is the honest silent state; a banner
  // that renders green on a failed query is not.
  const { data: taxiRows } = await supabase
    .from('taxi_eligibility_status')
    .select(
      'contract_id, weeks_used, weeks_max, weeks_left, eligibility_spent, warning, locked, last_demotion_available'
    )
    .eq('team_id', teamId);

  const taxiByContract = {};
  (taxiRows || []).forEach((r) => {
    if (r.warning) taxiByContract[r.contract_id] = r;
  });

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

  // ---- THE OVERVIEW TAB'S OWN READS (phase 2B) -----------------------------
  //
  // All four are league-public and read with the anon client. The two that are
  // not -- waiver priority and the transaction log -- sit further down with the
  // other session-client reads, because neither view carries an anon grant.
  //
  // THE SCOREBOARD READ IS THE WHOLE SEASON FOR ONE TEAM. Fourteen rows at
  // most, so no row ceiling applies (SR-29 is satisfied by the team filter).
  // Reading the whole season rather than "this week" is what lets the tile show
  // last week's result underneath without a second query, and it means the tile
  // has something to draw before a week has been synced.
  const [
    { data: scoreRows, error: scoreError },
    { data: standingsRow },
    { data: calendarRows },
    { data: waiverRunRows },
  ] = await Promise.all([
    supabase
      .from('league_scoreboard')
      .select(
        'week_number, week_starts_at, home_team_id, home_team, home_points, away_team_id, away_team, away_points, has_scores, week_is_final, winner_team_id'
      )
      .eq('season_year', currentSeasonYear)
      .or('home_team_id.eq.' + teamId + ',away_team_id.eq.' + teamId)
      .order('week_number', { ascending: true }),
    supabase
      .from('league_standings')
      .select('games, wins, losses, ties, points_for, league_rank, streak')
      .eq('season_year', currentSeasonYear)
      .eq('team_id', teamId)
      .maybeSingle(),
    // The view pre-renders day_label and time_label in America/New_York, so
    // nothing here formats them again (CLAUDE.md, dates and times). is_past is
    // the view's own flag -- this page owns no clock.
    supabase
      .from('league_calendar')
      .select('entry_id, title, detail, day_label, time_label, starts_at, is_provisional')
      .eq('season_year', currentSeasonYear)
      .eq('is_past', false)
      .order('starts_at', { ascending: true })
      .limit(COMING_UP_ROWS),
    // The next scheduled waiver run. waiver_runs is public (RLS "public read"),
    // unlike waiver_claims -- the SCHEDULE is league information; who has
    // claimed what is sealed until the run executes, and nothing here asks.
    supabase
      .from('waiver_runs')
      .select('id, week_number, runs_at, status')
      .eq('season_year', currentSeasonYear)
      .eq('status', 'scheduled')
      .gt('runs_at', new Date().toISOString())
      .order('runs_at', { ascending: true })
      .limit(1),
  ]);

  const nextWaiverRun = (waiverRunRows || [])[0] || null;

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
  //
  // (The read itself now sits above, where the season list is built from it.)
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

  // The grid's year tag reads provisionalCaps (from league_cap_settings), not
  // these per-team copies: a season with a cap row but no contract money for
  // this team has no team_cap_by_season row at all. PROV means a cap that IS
  // set and is still a placeholder; PROJ means no cap row exists.

  // OWNER INFO. Read with the SESSION-AWARE client, not the module-level
  // `supabase` above.
  //
  // Every other read on this page uses the anon client, because everything
  // else here is public under RLS. owner_directory() is not: it resolves the
  // caller through auth.uid() and raises for a caller who has none, and the
  // whole per-field masking decision depends on knowing who is asking. Called
  // with the anon client it would fail on every request, for everyone.
  //
  // Skipped entirely when nobody is signed in -- the function would raise, and
  // an expected refusal should not arrive as an error banner.
  // DRAFT PICKS moved OFF this page in phase 2B, under ruling R-9: Team HQ has
  // three tabs -- Overview, Roster, Money -- and Draft stays a league-level
  // page. Nothing was lost: /draft-picks is the same board for every team and
  // already carries the per-team halves, and the Overview links to it. The
  // read that used to live here (draft_pick_board, authenticated-only because
  // it calls winning_bid_link) went with it. Do not re-add it here.
  //
  // WAIVER PRIORITY and the TRANSACTION LOG are the two session-client reads
  // that replaced it, and each is here for the same kind of reason:
  //
  //   waiver_priority_order()  SECURITY DEFINER, granted to `authenticated`
  //                            only. It is league-wide, not own-team -- every
  //                            owner's priority is public information once
  //                            they are signed in, exactly as the standings
  //                            are.
  //   league_transaction_log   a security_invoker view with no anon grant.
  //                            Same league-public-to-owners status; it is the
  //                            view behind /transactions.
  //
  // Neither is narrowed to the team's own owner, and neither should be: this
  // is a team page any owner may read, and the moves it lists are already on
  // the league transaction page.
  let ownerDirectory = [];
  let ownerDirectoryError = null;
  let waiverPriority = null;
  let recentMoves = [];
  let recentMovesError = null;
  // DESIGNATED CUTS -- end-of-week cuts this owner has designated that have not fired
  // and were not withdrawn. OWN TEAM ONLY: read with the session client, and only when
  // the viewer is this team's owner. pending_cuts carries a contract_id and no team
  // column, so it is filtered on the active contracts already loaded above, and the
  // player's name comes from that same list rather than a second read.
  let pendingCuts = [];
  let pendingCutsError = null;
  if (me) {
    const authed = await createSupabaseServerClient();
    const { data: dirRows, error: dirErr } = await authed.rpc('owner_directory');
    ownerDirectory = dirRows || [];
    // CAPTURED, NOT DISCARDED -- the same lesson as yearRows above. An empty
    // directory rendered silently would read as "nobody has filled anything
    // in", which is a plausible-looking wrong answer.
    ownerDirectoryError = dirErr ? dirErr.message : null;

    // NO ARGUMENTS, DELIBERATELY. Both parameters default to NULL, which means
    // "the current season, every week that has been scored". That is the same
    // order the run itself will use when it fires, which is the only order
    // worth showing an owner. Passing a through-week here would show a figure
    // the run does not use.
    const { data: priorityRows } = await authed.rpc('waiver_priority_order');
    if (Array.isArray(priorityRows)) {
      const mine = priorityRows.find((r) => r.team_id === teamId);
      if (mine) {
        waiverPriority = {
          priority: Number(mine.priority),
          of: priorityRows.length,
          pointsFor: mine.points_for === null ? null : Number(mine.points_for),
        };
      }
    }

    const { data: moveRows, error: moveErr } = await authed
      .from('league_transaction_log')
      .select(
        'log_id, occurred_at, kind, title, description, player_id, player_name, player_position'
      )
      .eq('season_year', currentSeasonYear)
      .or('team_from_id.eq.' + teamId + ',team_to_id.eq.' + teamId)
      .order('occurred_at', { ascending: false })
      .limit(RECENT_MOVE_ROWS);
    // The timestamp is rendered HERE, on the server, in Eastern. league_transaction_log
    // returns a raw timestamptz rather than a pre-rendered label the way
    // league_calendar does, so it has to be formatted somewhere -- and a client
    // component calling toLocaleString renders in the viewer's own zone, which
    // is the bug lib/formatDate.js exists to prevent.
    recentMoves = (moveRows || []).map((r) => ({
      log_id: r.log_id,
      when: formatShortDateTime(r.occurred_at),
      title: r.title,
      description: r.description,
      player_id: r.player_id,
      player_name: r.player_name,
      player_position: r.player_position,
    }));
    // Captured for the same reason as the directory: an empty list rendered
    // silently reads as "this team has done nothing", which is a plausible
    // wrong answer on a page an owner uses to check their own work.
    recentMovesError = moveErr ? moveErr.message : null;

    if (me.team_id === teamId && contractIds.length > 0) {
      const { data: cutRows, error: cutErr } = await authed
        .from('pending_cuts')
        .select('id, contract_id, fires_at')
        .in('contract_id', contractIds)
        .is('fired_at', null)
        .is('withdrawn_at', null)
        .order('fires_at', { ascending: true });
      pendingCuts = (cutRows || []).map((row) => {
        const c = (contracts || []).find((x) => x.id === row.contract_id);
        return {
          id: row.id,
          playerId: c && c.players ? c.players.id : null,
          playerName: c && c.players ? c.players.full_name : 'Unknown Player',
          firesAt: row.fires_at,
        };
      });
      // Captured, not discarded. The block is omitted when there are no rows,
      // so a failed read that rendered as nothing would read as "no cuts
      // designated" -- a plausible-looking wrong answer.
      pendingCutsError = cutErr ? cutErr.message : null;
    }
  }

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
        position: c.players?.position || '—',
        typeLabel: CONTRACT_TYPE_LABELS[c.contract_type] || c.contract_type,
        // R-10. The class name rather than the raw type, so the table never has
        // to know the mapping and a third marker is one line here.
        markerClass: CONTRACT_MARKER[c.contract_type] || '',
        // Where this player currently sits: active | taxi | ir. Displayed as a
        // tag beside the name when it is not 'active', and used by the roster
        // move dialog to know which destinations are worth offering. It is
        // never used to decide whether a move is LEGAL -- set_roster_status()
        // and the check_taxi_eligibility trigger own that.
        rosterStatus: c.roster_status || 'active',
        span: totalSpan > 1 ? c.start_year + '–' + endYear : String(c.start_year),
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

  // ---- THE MATCHUP TILE ----------------------------------------------------
  //
  // WHICH WEEK IS "THIS WEEK" is decided by week_starts_at against the server
  // clock, not by a week number written down anywhere. A Server Component
  // reading Date.now() is correct and never hydrates (CLAUDE.md); the same line
  // in a client component would be a hydration bug.
  //
  // The current week is the LAST week that has started. Before the season
  // starts nothing has, so the first row is shown as an upcoming fixture
  // rather than as a 0-0 result.
  const games = (scoreRows || []).slice().sort((a, b) => a.week_number - b.week_number);
  const nowMs = Date.now();
  let thisGame = null;
  let lastGame = null;
  games.forEach((g) => {
    const startsAt = g.week_starts_at ? new Date(g.week_starts_at).getTime() : null;
    if (startsAt !== null && startsAt <= nowMs) {
      lastGame = thisGame;
      thisGame = g;
    }
  });
  let thisWeekNotStarted = false;
  if (!thisGame && games.length > 0) {
    thisGame = games[0];
    thisWeekNotStarted = true;
  }

  function sideOf(g) {
    if (!g) return null;
    const meHome = g.home_team_id === teamId;
    const mine = meHome ? g.home_points : g.away_points;
    const theirs = meHome ? g.away_points : g.home_points;
    const known = (v) => v !== null && v !== undefined;
    return {
      weekNumber: g.week_number,
      myName: meHome ? g.home_team : g.away_team,
      oppName: meHome ? g.away_team : g.home_team,
      // A SCORE IS NOT MONEY, and it is not rounded. It is also carried as the
      // string PostgREST returned rather than a Number: 0.00 is a real Sleeper
      // score and Number('0.00') renders as "0", which reads as "not reported"
      // beside a row that says a dash for exactly that.
      myPoints: known(mine) ? String(mine) : null,
      oppPoints: known(theirs) ? String(theirs) : null,
      // The comparison is numeric even though the display is not. Nothing here
      // declares a winner -- the view does that, in winner_team_id -- this only
      // decides which of two numbers is drawn brighter while a week is live.
      iLead:
        known(mine) && known(theirs) && Number(mine) !== Number(theirs)
          ? Number(mine) > Number(theirs)
          : null,
      hasScores: Boolean(g.has_scores),
      isFinal: Boolean(g.week_is_final),
      iWon: g.winner_team_id ? g.winner_team_id === teamId : null,
    };
  }

  const matchup = thisGame
    ? {
        ...sideOf(thisGame),
        notStarted: thisWeekNotStarted,
        previous: lastGame ? sideOf(lastGame) : null,
      }
    : null;

  // A week with scores that is NOT final is still moving. Everything downstream
  // of this -- the tile's own label, and the caveat on the waiver priority --
  // hangs off it rather than off a date.
  const weekIsLive = Boolean(matchup && matchup.hasScores && !matchup.isFinal);

  // ---- COMING UP -----------------------------------------------------------
  //
  // The calendar plus the one instant the calendar does not carry: the waiver
  // run, which lives on waiver_runs. Merged by time so the reader gets the next
  // four things in the order they happen, whichever table they came from.
  const comingUp = [];
  if (nextWaiverRun) {
    const note = [];
    if (waiverPriority) {
      note.push(
        'Your priority: ' +
          waiverPriority.priority +
          ' of ' +
          waiverPriority.of +
          (weekIsLive
            ? ' — provisional while this week is being played.'
            : '.')
      );
    } else if (me) {
      note.push('Waiver priority could not be read.');
    } else {
      // Not "sign in" -- under R-7 nobody reaches this page without a session.
      // This is the signed-in-but-unlinked case: a real login with no
      // team_owners row, which is what getCurrentTeamOwner() returns null for.
      note.push('Your login is not linked to a team yet.');
    }
    note.push('Priority is lowest points for, not record.');
    comingUp.push({
      key: 'waiver:' + nextWaiverRun.id,
      when: etWhen(nextWaiverRun.runs_at),
      at: nextWaiverRun.runs_at,
      title: 'Waiver wire runs — Week ' + nextWaiverRun.week_number,
      note: note.join(' '),
      flag: true,
    });
  }
  (calendarRows || []).forEach((r) => {
    comingUp.push({
      key: r.entry_id,
      // Already rendered in Eastern by the view. Do not reformat it.
      when: (r.day_label || '') + (r.time_label ? ' · ' + r.time_label : ''),
      at: r.starts_at,
      title: r.title,
      note: firstLine(r.detail, 150),
      flag: false,
      provisional: Boolean(r.is_provisional),
    });
  });
  comingUp.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const comingUpRows = comingUp.slice(0, COMING_UP_ROWS);

  // ---- THE STAT RAIL -------------------------------------------------------
  //
  // R-12 GOVERNS THESE FOUR, AND SR-22 DOES NOT. The rail is a headline, not a
  // money screen: cap room is formatRoom (rounds DOWN, so room never reads
  // higher than it is and an overage never reads smaller), cash the same. The
  // Money tab below is the money screen and still prints the exact figure to
  // the cent through formatExactMoney, which is what SR-22 is about. The rail
  // says where the exact number is, so the two can never be mistaken for a
  // disagreement.
  const thisSeason = capBySeason[currentSeasonYear] || {};
  const capRoomRaw = thisSeason.capSpace;
  const capRoomKnown = capRoomRaw !== null && capRoomRaw !== undefined;
  const capRoomNegative = capRoomKnown && Number(capRoomRaw) < 0;
  const cashRaw = cashAvailable[currentSeasonYear];
  // No cash row and a zero balance are different facts (CLAUDE.md).
  const cashKnown = cashRaw !== undefined && cashRaw !== null;

  const record = standingsRow
    ? standingsRow.wins +
      '–' +
      standingsRow.losses +
      (standingsRow.ties ? '–' + standingsRow.ties : '')
    : null;

  const rail = [
    {
      key: 'cap',
      label: 'CAP ROOM',
      value: capRoomKnown ? formatRoom(capRoomRaw) : '—',
      tone: capRoomKnown ? (capRoomNegative ? 'is-bad' : 'is-cap') : 'is-none',
      note: capRoomKnown
        ? capRoomNegative
          ? 'over the ' + currentSeasonYear + ' cap'
          : 'under the ' + currentSeasonYear + ' cap'
        : 'no cap set for ' + currentSeasonYear,
    },
    {
      key: 'cash',
      label: 'CASH',
      value: cashKnown ? formatRoom(cashRaw) : '—',
      tone: cashKnown ? (Number(cashRaw) < 0 ? 'is-bad' : 'is-cash') : 'is-none',
      note: cashKnown ? 'left to spend' : 'no budget set',
    },
    {
      key: 'record',
      label: 'RECORD',
      value: record || '—',
      tone: 'is-none',
      note: standingsRow
        ? (standingsRow.games
            ? standingsRow.league_rank + ' of 10 · ' + standingsRow.points_for + ' PF'
            : 'no games played')
        : 'not in the standings',
    },
    {
      key: 'waiver',
      label: 'WAIVER',
      value: waiverPriority
        ? waiverPriority.priority + ' / ' + waiverPriority.of
        : '—',
      tone: 'is-none',
      note: waiverPriority
        ? weekIsLive
          ? 'provisional · lowest points for'
          : 'lowest points for'
        : me
        ? 'could not be read'
        : 'login not linked to a team',
    },
  ];

  return (
    <>
      {/*
        THE HERO IS DARK IN BOTH THEMES, which is why every colour inside it is
        a literal in app/kit.css rather than a theme token. The app bar learned
        this the expensive way in phase 1: it sat on the same permanently dark
        --hero while its controls read --ink-2, so in light mode it was dark
        grey on near-black and nobody saw it because the league was in dark.
        Nothing in here may read --ink, --surface or a currency token.
      */}
      <header className="edfl-hero">
        <div className="edfl-hero-inner">
          <div className="edfl-hero-row">
            <div>
              <p className="edfl-hero-eyebrow">
                {leagueName} &middot; {currentSeasonYear}
                {team.abbrev ? ' · ' + team.abbrev : ''}
              </p>
              <h1 className="edfl-hero-name">{team.name}</h1>
            </div>
            {matchup && (
              <div className="edfl-hero-side">
                <strong>
                  {matchup.notStarted || !matchup.hasScores
                    ? 'Week ' + matchup.weekNumber
                    : 'Week ' +
                      matchup.weekNumber +
                      ' · ' +
                      matchup.myPoints +
                      '–' +
                      matchup.oppPoints}
                </strong>
                {matchup.notStarted || !matchup.hasScores
                  ? 'vs ' + matchup.oppName
                  : matchup.isFinal
                  ? 'final vs ' + matchup.oppName
                  : 'live vs ' + matchup.oppName}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="edfl-railband">
        <div className="edfl-rail">
          {rail.map((cell) => (
            <div className="edfl-rail-cell" key={cell.key}>
              <div className="edfl-rail-label">{cell.label}</div>
              <div className={'edfl-rail-value ' + cell.tone}>{cell.value}</div>
              <div className="edfl-rail-note">{cell.note}</div>
            </div>
          ))}
        </div>
      </div>

      <main className="page">
        {/* BREADCRUMBS (Sept 11, 2026) stay inside .page rather than moving up
            into the hero. They are drawn in theme ink, and theme ink on the
            permanently dark hero is the light-mode bug described above. */}
        <Breadcrumbs
          trail={[
            { label: 'Cap Sheet', href: '/cap-sheet' },
            { label: team.name },
          ]}
        />

        {/*
          ABOVE THE TABS, NOT INSIDE THEM. Compliance is a property of the team,
          not of one tab, so it must not disappear when an owner switches to
          Roster or Money -- which is exactly what would happen if it were
          rendered inside a tab branch. The Overview's roster-count strip reads
          the same view row, so the two cannot disagree.
        */}
        <ComplianceBanner
          row={complianceRow}
          error={complianceError ? complianceError.message : null}
        />

        <TeamCapSheet
          seasons={seasons}
          currentSeasonYear={currentSeasonYear}
          officialCaps={officialCaps}
          officialCeilings={officialCeilings}
          provisionalCaps={provisionalCaps}
          minSpendPct={minSpendPct}
          capBySeason={capBySeason}
          capRowsError={capRowsError ? capRowsError.message : null}
          yearRowsError={yearRowsError ? yearRowsError.message : null}
          cashAvailable={cashAvailable}
          rosterBySeason={rosterBySeason}
          taxiByContract={taxiByContract}
          canCut={canCut}
          canMove={canMove}
          showOwnerInfo={Boolean(me)}
          ownerDirectory={ownerDirectory}
          ownerDirectoryError={ownerDirectoryError}
          teamId={teamId}
          isMine={isMine}
          complianceRow={complianceRow}
          complianceError={complianceError ? complianceError.message : null}
          matchup={matchup}
          scoreError={scoreError ? scoreError.message : null}
          comingUp={comingUpRows}
          recentMoves={recentMoves}
          recentMovesError={recentMovesError}
          recentMovesGated={!me}
        />

        {/*
          UNDER THE ROSTER, OWN TEAM ONLY. Drawn only when the owner has at least one
          designated cut still waiting to fire; omitted entirely otherwise. A failed read
          renders its message rather than nothing -- see pendingCutsError above.
        */}
        {pendingCutsError && (
          <p className="form-error">
            Couldn&apos;t read your designated cuts: {pendingCutsError}
          </p>
        )}
        {pendingCuts.length > 0 && <DesignatedCuts cuts={pendingCuts} />}
      </main>
    </>
  );
}

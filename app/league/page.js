import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatMoney } from '../../lib/formatMoney';
import { easternDateKey } from '../../lib/formatDate';
import { designationFor } from '../../lib/injuryReport';
import LeagueView from './LeagueView';
import {
  RECENT_DAYS,
  LIST_ROWS,
  transactionGroups,
  keyInjuries,
  keyDates,
} from './leagueModel';

// Records, injuries, moves and room all move during a week -- never cache.
export const revalidate = 0;
export const metadata = { title: 'League' };

/**
 * THE LEAGUE PAGE -- redrawn November 14, 2026 (UI test batch 15).
 *
 * Lewis, that morning: the League page is FIVE SUMMARY BOXES -- Standings, Key
 * Injuries, Recent Transactions, Cap Space and Key Dates, in that order -- each
 * linking to its full page. Matchups and scores LEFT this page; they get a new
 * section of their own (the Scoreboard and Team HQ's matchup tile still carry
 * them). The look is Option B of the Claude Design canvas "EDFL League tab
 * (test site)", with his canvas notes through 12:16 ET. league-page.md carries
 * the decisions that protect this file.
 *
 * WHO READS WHAT. Standings, cap, the calendar, the weeks, teams and season
 * stats carry a public read grant and are read as anon, like the pages they
 * summarise. The injury report, the transaction log and the projections are
 * granted to authenticated only, so they go through the session client --
 * through anon they return nothing and the boxes would read as empty, which
 * must never look like "no injuries". getCurrentTeamOwner() decides one thing:
 * which row is yours.
 *
 * EACH BOX FAILS ON ITS OWN. A read that IS a box's content fails that box
 * closed: an error line in the box, never an empty list (ui-patterns.md). The
 * page never goes down because one box could not load.
 *
 * THE CLOCK is read here, once, on the server (money-and-dates.md). "Next week"
 * for a projection is the first league week whose first game has not kicked
 * off, the same first_game_at test /scoreboard uses.
 */

const TX_CAP = 500; // a week of moves is far below this; reaching it says so

export default async function LeaguePage() {
  const [{ data: config }, teamOwner, sb] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    getCurrentTeamOwner(),
    createSupabaseServerClient(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  const nowMs = Date.now();
  const todayKey = easternDateKey(nowMs);
  const sinceIso = new Date(nowMs - RECENT_DAYS * 86400000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const [standingsRes, teamsRes, capRes, capSetRes, injRes, txRes, weeksRes, calRes] =
    await Promise.all([
      supabase
        .from('league_standings')
        .select('team_id, team_name, games, wins, losses, ties, points_for, points_against,' +
          ' point_differential, league_rank')
        .eq('season_year', season)
        .order('league_rank', { ascending: true }),
      // The trigraph, joined rather than derived from a name.
      supabase.from('teams').select('id, abbrev'),
      // FILTERED BY SEASON: team_cap_summary has one row per team per season.
      supabase
        .from('team_cap_summary')
        .select('team_id, team_name, cap_space_remaining')
        .eq('league_season_year', season)
        .order('cap_space_remaining', { ascending: false })
        .order('team_name', { ascending: true }),
      // The cap in the box title comes from here, never a literal (Lewis, Nov
      // 14: "set it up so that it automatically updates each year").
      supabase
        .from('league_cap_settings')
        .select('season_year, fantasy_salary_cap, is_provisional')
        .eq('season_year', season)
        .maybeSingle(),
      // Rostered players carrying a designation: bounded by roster sizes, far
      // below PostgREST's 1,000-row ceiling, and ordered on a unique key.
      sb
        .from('league_injury_report')
        .select('player_id, full_name, position, nfl_team, injury_status, injury_body_part,' +
          ' edfl_team_id, edfl_team, change_flag')
        .eq('is_rostered', true)
        .not('injury_status', 'is', null)
        .order('player_id', { ascending: true })
        .range(0, 999),
      // Bound-and-warn (data-fetching.md): a week of moves, newest first.
      sb
        .from('league_transaction_log')
        .select('log_id, occurred_at, kind, title, player_id, player_name, player_position,' +
          ' team_from_id, team_from, team_to_id, team_to, detail')
        .gte('occurred_at', sinceIso)
        .order('occurred_at', { ascending: false })
        .order('log_id', { ascending: true })
        .range(0, TX_CAP - 1),
      supabase
        .from('league_weeks')
        .select('week_number, first_game_at')
        .eq('season_year', season)
        .order('week_number', { ascending: true }),
      // One-off dates only: source 'event'. The weekly "Week N begins" rows
      // are source 'week' and Lewis asked for them to stay off this box.
      supabase
        .from('league_calendar')
        .select('entry_id, title, starts_at, ends_at, is_provisional, local_date, end_local_date,' +
          ' day_label, end_day_label, time_label')
        .eq('season_year', season)
        .eq('source', 'event')
        .or('starts_at.gt.' + nowIso + ',ends_at.gt.' + nowIso)
        .order('starts_at', { ascending: true })
        .order('title', { ascending: true })
        .range(0, 99),
    ]);

  const abbrevById = {};
  (teamsRes.data || []).forEach(function (t) {
    abbrevById[t.id] = t.abbrev || '';
  });

  // ---- next week, for the projections --------------------------------------
  let projWeek = null;
  (weeksRes.data || []).forEach(function (w) {
    if (projWeek !== null) return;
    if (w.first_game_at && Date.parse(w.first_game_at) > nowMs) projWeek = w.week_number;
  });

  // ---- the second round: stats and projections for the players listed ------
  const injRows = injRes.data || [];
  const txRows = txRes.data || [];
  const ids = Array.from(
    new Set(
      injRows.map(function (r) { return r.player_id; })
        .concat(txRows.map(function (r) { return r.player_id; }))
        .filter(Boolean)
    )
  );

  const [statsRes, projRes] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('edfl_player_season_stats')
          .select('player_id, fantasy_points, fppg')
          .eq('season_year', season)
          .in('player_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0 && projWeek !== null
      ? sb
          .from('player_week_projections')
          .select('player_id, proj_points')
          .eq('season_year', season)
          .eq('week_number', projWeek)
          .is('withdrawn_at', null)
          .in('player_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const pointsById = {};
  const fppgById = {};
  (statsRes.data || []).forEach(function (s) {
    pointsById[s.player_id] = s.fantasy_points;
    fppgById[s.player_id] = s.fppg;
  });
  const projById = {};
  (projRes.data || []).forEach(function (p) {
    projById[p.player_id] = p.proj_points;
  });

  // ---- shape each box -------------------------------------------------------
  const standings = standingsRes.data || [];
  const capRows = capRes.data || [];
  const capSet = capSetRes.data || null;
  const injuries = keyInjuries(injRows, pointsById, LIST_ROWS);
  const tx = transactionGroups(txRows, projById, fppgById, LIST_ROWS);
  const dates = keyDates(calRes.data || [], nowMs, LIST_ROWS);

  // The injury count bar: every rostered designation, grouped by its label,
  // most serious first (lib/injuryReport.js is the vocabulary).
  const injCounts = [];
  const byLabel = {};
  injRows.forEach(function (r) {
    const d = designationFor(r.injury_status);
    if (!d) return;
    if (!byLabel[d.label]) {
      byLabel[d.label] = { label: d.label, tone: d.tone, severity: d.severity, n: 0 };
      injCounts.push(byLabel[d.label]);
    }
    byLabel[d.label].n += 1;
  });
  injCounts.sort(function (a, b) { return a.severity - b.severity; });
  const injTotal = injCounts.reduce(function (s, c) { return s + c.n; }, 0);
  let badSeen = 0;
  let warnSeen = 0;
  injCounts.forEach(function (c) {
    c.shade = c.tone === 'bad' ? 'b' + Math.min(badSeen++, 2) : 'w' + Math.min(warnSeen++, 2);
  });

  const maxRoom = capRows.reduce(function (m, r) {
    const v = Number(r.cap_space_remaining);
    return Number.isFinite(v) && v > m ? v : m;
  }, 0);

  const capTitle = capSet && capSet.fantasy_salary_cap !== null && capSet.fantasy_salary_cap !== undefined
    ? season + ' Salary Cap – ' + formatMoney(capSet.fantasy_salary_cap) +
      (capSet.is_provisional ? ', provisional' : '')
    : null;

  return (
    <LeagueView
      leagueName={leagueName}
      season={season}
      myTeamId={myTeamId}
      abbrevById={abbrevById}
      projWeek={projWeek}
      todayKey={todayKey}
      standings={standings}
      standingsError={standingsRes.error || null}
      injuries={injuries}
      injAny={injRows.length > 0}
      injCounts={injCounts}
      injTotal={injTotal}
      injError={injRes.error || null}
      statsError={statsRes.error || null}
      tx={tx}
      txError={txRes.error || null}
      txCapped={txRows.length >= TX_CAP}
      txCap={TX_CAP}
      projError={projRes.error || null}
      capRows={capRows}
      capError={capRes.error || null}
      capTitle={capTitle}
      maxRoom={maxRoom}
      dates={dates}
      calError={calRes.error || null}
    />
  );
}

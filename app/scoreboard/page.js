import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import Scoreboard from './Scoreboard';

// Scores and projections both move during a week -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Scoreboard' };

/**
 * THE LEAGUE SCOREBOARD. Five matchups a week, fourteen weeks.
 *
 * PHASE 2G-1, September 20, 2026. Three things changed and nothing else:
 *
 *   1. THE SCORES COME FIRST AND THE WEEK PICKER GOES LAST. Owner request.
 *      The page opens on the week in progress, which is what anyone loading
 *      /scoreboard on a Sunday came for; the fourteen-week strip is a thing
 *      you go looking for, not a thing you should have to scroll past. On a
 *      phone the old order put a two-row tab strip above the fold and pushed
 *      the first matchup below it.
 *
 *   2. THE PAGE SPEAKS THE REDESIGN'S LANGUAGE. It was the last route still
 *      drawing its own boxes with inline `border: 1px solid var(--border)`
 *      while /league drew the identical thing with .lg-game and .lg-side.
 *      Two spellings of one component is how they drift. This file now uses
 *      the kit classes, so the scoreboard and the League screen cannot end
 *      up looking like two different apps.
 *
 *   3. THE TEAM NAMES ARE READABLE IN DARK MODE. That was the bug report and
 *      the cause was not on this page: `.team-name` is a CLASSED anchor, so
 *      kit.css's `a:not([class])` rule never reached it, and every team name
 *      here and on /standings rendered in the BROWSER's default link blue --
 *      #0000EE on a #161B23 card -- and in purple once visited. The fix is a
 *      rule in kit.css, not a colour typed in here. This page stops using
 *      .team-name at all and uses .lg-side, which reads --ink like the rest
 *      of the redesign.
 *
 * BATCH 5, October 8, 2026 (commissioner request): WEEKS STILL TO COME SHOW
 * THEIR FIXTURES, PROJECTED. A week only reached league_scoreboard once
 * team_week_scores had rows for it, so every unplayed week read "No matchups
 * have been pulled" although the pairings for the whole season sit in
 * league_matchups. edfl_projected_fixtures() returns every fixture of every
 * week not yet scored, with each side's projected best-ball total computed in
 * SQL. It has no anon grant (per-player projections stay behind a session),
 * so it is read through the SESSION client; the middleware guarantees one.
 * Its failure fails only the projected weeks, never the scored ones.
 *
 * THE REFRESH CONTROL IS GONE (To-Do 96, SR-72). It called the retired
 * Sleeper-points engine and did nothing all season; scores now come from the
 * final-stats job on its own. See .claude/rules/scoreboard-and-matchups.md
 * before adding any control back.
 *
 * READ AS ANON, still, for the scored weeks: league_scoreboard, league_weeks
 * and teams all carry a public read grant. getCurrentTeamOwner() decides one
 * thing: which row is marked as yours.
 *
 * THE TAB LIST COMES FROM league_weeks, NOT FROM A COUNT. Week 12 of 2026
 * begins on a Wednesday because of Thanksgiving, and weeks 13 and 14 are
 * still provisional. A strip built by assuming fourteen Thursdays would be
 * wrong twice over, and this is the same table the dead-money engine charges
 * against, so the scoreboard and the salary clock cannot disagree about when
 * a week is.
 */
export default async function ScoreboardPage() {
  const [{ data: config }, teamOwner] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    getCurrentTeamOwner(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  const sessionClient = await createSupabaseServerClient();

  const [weeksRes, rowsRes, teamsRes, fixturesRes] = await Promise.all([
    supabase
      .from('league_weeks')
      .select('week_number, charge_at, first_game_at, is_provisional')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
    // Filtered by season, so the 1,000-row PostgREST ceiling cannot bite: a
    // season is fourteen weeks of five matchups (SR-29).
    supabase
      .from('league_scoreboard')
      .select(
        'week_number, matchup_id, home_team_id, home_team, home_owner, home_points,' +
          ' away_team_id, away_team, away_owner, away_points, has_scores, winner_team_id,' +
          ' margin, synced_at, week_starts_at, week_is_provisional, week_is_final, week_final_at'
      )
      .eq('season_year', season)
      .order('week_number', { ascending: true })
      .order('matchup_id', { ascending: true }),
    // The trigraph. league_scoreboard does not carry teams.abbrev, so it is
    // joined here rather than derived from the name -- a team without one
    // shows an empty disc, never a guess. Same rule /league is written under.
    supabase.from('teams').select('id, abbrev'),
    // Every fixture of every week with no score yet, one season: at most
    // fourteen weeks of five, far under the row ceiling. Already ordered by
    // week and matchup in SQL.
    sessionClient.rpc('edfl_projected_fixtures', { p_season: season }),
  ]);

  const weeks = weeksRes.data || [];
  const rows = rowsRes.data || [];
  const error = weeksRes.error || rowsRes.error || teamsRes.error || null;
  const fixtures = fixturesRes.data || [];
  const fixturesError = fixturesRes.error ? fixturesRes.error.message : null;

  const abbrevById = {};
  (teamsRes.data || []).forEach(function (t) {
    abbrevById[t.id] = t.abbrev || '';
  });

  // The week in progress: the last one whose first_game_at has passed. Before
  // the season opens that is none of them, so week 1 is the landing tab. A
  // Server Component reading Date.now() is correct and never hydrates
  // (CLAUDE.md).
  const now = Date.now();
  let currentWeek = weeks.length > 0 ? weeks[0].week_number : 1;
  for (let i = 0; i < weeks.length; i += 1) {
    if (new Date(weeks[i].first_game_at).getTime() <= now) {
      currentWeek = weeks[i].week_number;
    }
  }

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">
        {leagueName} &middot; {season}
      </p>
      <h1>Scoreboard</h1>
      <p className="subhead">
        Every matchup, week by week. A played week shows best-ball scores off the active roster,
        scored by league rules from Sleeper&rsquo;s stat lines every few minutes while games are
        on. A week still to come shows each team&rsquo;s projected lineup. Weeks are read from the
        same rows the dead-money engine charges against, so the scoreboard and the salary clock
        cannot disagree.
      </p>

      {error && <p className="empty-note">Couldn&apos;t load the scoreboard: {error.message}</p>}

      {!error && weeks.length === 0 && (
        <p className="empty-note">
          No weekly calendar has been loaded for {season}, so there are no weeks to show.
        </p>
      )}

      {!error && weeks.length > 0 && (
        <Scoreboard
          season={season}
          weeks={weeks}
          rows={rows}
          fixtures={fixtures}
          fixturesError={fixturesError}
          abbrevById={abbrevById}
          myTeamId={myTeamId}
          initialWeek={currentWeek}
        />
      )}
    </main>
  );
}
